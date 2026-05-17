import { Router, type IRouter } from "express";
import simpleGit from "simple-git";
import {
  GitStatusQueryParams,
  GitLogQueryParams,
  ListGitBranchesQueryParams,
  GitCommitBody,
  GitDiffQueryParams,
} from "@workspace/api-zod";
import { incrementToolCall } from "../lib/serverMetrics";

const router: IRouter = Router();

function getGit(repoPath: string) {
  return simpleGit(repoPath);
}

router.get("/git/status", async (req, res): Promise<void> => {
  const parsed = GitStatusQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const git = getGit(parsed.data.path ?? ".");
    const status = await git.status();
    res.json({
      branch: status.current ?? "unknown",
      clean: status.isClean(),
      ahead: status.ahead,
      behind: status.behind,
      staged: status.staged,
      unstaged: [...status.modified, ...status.deleted].map((f) => (typeof f === "string" ? f : String(f))),
      untracked: status.not_added,
    });
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Git error" });
  }
});

router.get("/git/log", async (req, res): Promise<void> => {
  const parsed = GitLogQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const git = getGit(parsed.data.path ?? ".");
    const options: string[] = [`--max-count=${parsed.data.limit ?? 20}`];
    if (parsed.data.branch) options.push(parsed.data.branch);
    const log = await git.log(options);
    res.json(
      log.all.map((c) => ({
        hash: c.hash,
        message: c.message,
        author: c.author_name,
        email: c.author_email,
        date: c.date,
      }))
    );
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Git error" });
  }
});

router.get("/git/branches", async (req, res): Promise<void> => {
  const parsed = ListGitBranchesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const git = getGit(parsed.data.path ?? ".");
    const branches = await git.branchLocal();
    res.json(
      branches.all.map((name) => ({
        name,
        current: name === branches.current,
        remote: null,
        lastCommit: null,
      }))
    );
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Git error" });
  }
});

router.post("/git/commit", async (req, res): Promise<void> => {
  const parsed = GitCommitBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const start = Date.now();
  try {
    const git = getGit(".");
    if (parsed.data.all) {
      await git.add(".");
    } else if (parsed.data.files?.length) {
      await git.add(parsed.data.files);
    }
    const result = await git.commit(parsed.data.message);
    incrementToolCall("git_commit", Date.now() - start, false);
    const log = await git.log(["--max-count=1"]);
    const latest = log.latest;
    res.json({
      hash: latest?.hash ?? result.commit,
      message: latest?.message ?? parsed.data.message,
      author: latest?.author_name ?? "",
      email: latest?.author_email ?? "",
      date: latest?.date ?? new Date().toISOString(),
    });
  } catch (err: unknown) {
    incrementToolCall("git_commit", Date.now() - start, true);
    res.status(400).json({ error: err instanceof Error ? err.message : "Git error" });
  }
});

router.get("/git/diff", async (req, res): Promise<void> => {
  const parsed = GitDiffQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const git = getGit(parsed.data.path ?? ".");
    const options: string[] = [];
    if (parsed.data.staged) options.push("--staged");
    if (parsed.data.file) options.push("--", parsed.data.file);
    const diff = await git.diff(options);
    res.json({
      diff,
      filesChanged: 0,
      insertions: 0,
      deletions: 0,
    });
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Git error" });
  }
});

export default router;
