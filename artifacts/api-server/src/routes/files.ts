import { Router, type IRouter } from "express";
import fs from "fs/promises";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import {
  ListFilesQueryParams,
  ReadFileQueryParams,
  WriteFileBody,
  DeleteFileQueryParams,
  SearchFilesQueryParams,
  MoveFileBody,
} from "@workspace/api-zod";

const execAsync = promisify(exec);
const router: IRouter = Router();

const WORK_DIR = process.env.WORK_DIR ?? process.cwd();

function resolveSafe(p: string): string {
  const resolved = path.resolve(WORK_DIR, p);
  if (!resolved.startsWith(WORK_DIR) && !resolved.startsWith("/")) {
    throw new Error("Path traversal not allowed");
  }
  return resolved;
}

async function statEntry(filePath: string) {
  const stat = await fs.stat(filePath);
  const name = path.basename(filePath);
  return {
    name,
    path: filePath,
    type: stat.isDirectory() ? "directory" : stat.isSymbolicLink() ? "symlink" : "file",
    size: stat.size,
    modifiedAt: stat.mtime.toISOString(),
    permissions: (stat.mode & 0o777).toString(8),
  };
}

async function listDir(dirPath: string, recursive: boolean, pattern: string | null | undefined): Promise<object[]> {
  const entries: object[] = [];
  const items = await fs.readdir(dirPath, { withFileTypes: true });
  for (const item of items) {
    if (item.name.startsWith(".") && item.name !== ".env") continue;
    const fullPath = path.join(dirPath, item.name);
    try {
      const entry = await statEntry(fullPath);
      if (!pattern || item.name.includes(pattern)) {
        entries.push(entry);
      }
      if (recursive && item.isDirectory()) {
        const children = await listDir(fullPath, recursive, pattern);
        entries.push(...children);
      }
    } catch {
      // skip unreadable
    }
  }
  return entries;
}

router.get("/files", async (req, res): Promise<void> => {
  const parsed = ListFilesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { path: p, recursive, pattern } = parsed.data;
  try {
    const dirPath = resolveSafe(p ?? ".");
    const entries = await listDir(dirPath, recursive ?? false, pattern ?? null);
    res.json(entries);
  } catch (err: unknown) {
    req.log.error({ err }, "List files error");
    res.status(400).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

router.get("/files/read", async (req, res): Promise<void> => {
  const parsed = ReadFileQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const filePath = resolveSafe(parsed.data.path);
    const stat = await fs.stat(filePath);
    const content = await fs.readFile(filePath, { encoding: (parsed.data.encoding ?? "utf-8") as BufferEncoding });
    res.json({
      path: parsed.data.path,
      content,
      size: stat.size,
      encoding: parsed.data.encoding ?? "utf-8",
      mimeType: null,
    });
  } catch (err: unknown) {
    const isNotFound = err instanceof Error && (err as NodeJS.ErrnoException).code === "ENOENT";
    res.status(isNotFound ? 404 : 400).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

router.post("/files/write", async (req, res): Promise<void> => {
  const parsed = WriteFileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const { path: p, content, encoding, createDirs } = parsed.data;
    const filePath = resolveSafe(p);
    if (createDirs !== false) {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
    }
    await fs.writeFile(filePath, content, { encoding: (encoding ?? "utf-8") as BufferEncoding });
    const stat = await fs.stat(filePath);
    res.json({
      name: path.basename(filePath),
      path: p,
      type: "file",
      size: stat.size,
      modifiedAt: stat.mtime.toISOString(),
      permissions: (stat.mode & 0o777).toString(8),
    });
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

router.delete("/files/delete", async (req, res): Promise<void> => {
  const parsed = DeleteFileQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const filePath = resolveSafe(parsed.data.path);
    await fs.rm(filePath, { recursive: parsed.data.recursive ?? false, force: false });
    res.json({ success: true, message: "Deleted" });
  } catch (err: unknown) {
    const isNotFound = err instanceof Error && (err as NodeJS.ErrnoException).code === "ENOENT";
    res.status(isNotFound ? 404 : 400).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

router.get("/files/search", async (req, res): Promise<void> => {
  const parsed = SearchFilesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { query, path: searchPath, filePattern, caseSensitive, maxResults } = parsed.data;
  try {
    const searchDir = resolveSafe(searchPath ?? ".");
    const flags = caseSensitive ? "" : "-i";
    const nameFilter = filePattern ? `--include="${filePattern}"` : "";
    const { stdout } = await execAsync(
      `grep -rn ${flags} ${nameFilter} --max-count=1 -m ${maxResults ?? 50} "${query.replace(/"/g, '\\"')}" "${searchDir}" 2>/dev/null | head -${maxResults ?? 50}`,
      { maxBuffer: 1024 * 1024 }
    );
    const results = stdout.split("\n").filter(Boolean).map((line) => {
      const match = line.match(/^(.+?):(\d+):(.+)$/);
      if (!match) return null;
      return {
        file: match[1],
        line: parseInt(match[2], 10),
        column: 1,
        match: query,
        context: match[3].trim(),
      };
    }).filter(Boolean);
    res.json(results);
  } catch (err: unknown) {
    res.json([]);
  }
});

router.post("/files/move", async (req, res): Promise<void> => {
  const parsed = MoveFileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const { from, to, overwrite } = parsed.data;
    const fromPath = resolveSafe(from);
    const toPath = resolveSafe(to);
    if (!overwrite) {
      try {
        await fs.access(toPath);
        res.status(400).json({ error: "Destination already exists" });
        return;
      } catch { /* ok */ }
    }
    await fs.mkdir(path.dirname(toPath), { recursive: true });
    await fs.rename(fromPath, toPath);
    const stat = await fs.stat(toPath);
    res.json({
      name: path.basename(toPath),
      path: to,
      type: stat.isDirectory() ? "directory" : "file",
      size: stat.size,
      modifiedAt: stat.mtime.toISOString(),
      permissions: (stat.mode & 0o777).toString(8),
    });
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

export default router;
