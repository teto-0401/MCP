#!/usr/bin/env node
import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, basename } from "path";

const TOKEN = process.env.GH_TOKEN;
const OWNER = "teto-0401";
const REPO = "replit-mcp-server";
const BASE = "/home/runner/workspace";

if (!TOKEN) { console.error("GH_TOKEN not set"); process.exit(1); }

const INCLUDE = [
  "package.json", "pnpm-workspace.yaml", "tsconfig.base.json", "tsconfig.json",
  "replit.md",
  "artifacts/api-server/src",
  "artifacts/api-server/package.json",
  "artifacts/api-server/tsconfig.json",
  "artifacts/api-server/build.mjs",
  "artifacts/api-server/Dockerfile",
  "artifacts/api-server/docker-compose.yml",
  "artifacts/api-server/README.md",
  "artifacts/mcp-dashboard/src",
  "artifacts/mcp-dashboard/package.json",
  "artifacts/mcp-dashboard/tsconfig.json",
  "artifacts/mcp-dashboard/vite.config.ts",
  "artifacts/mcp-dashboard/index.html",
  "lib/api-spec",
  "lib/api-client-react/src", "lib/api-client-react/package.json", "lib/api-client-react/tsconfig.json",
  "lib/api-zod/src", "lib/api-zod/package.json", "lib/api-zod/tsconfig.json",
  "lib/db/src", "lib/db/package.json", "lib/db/tsconfig.json",
];

const SKIP_DIRS = new Set(["node_modules", "dist", ".git", ".local", "coverage", ".replit-artifact"]);

function collectFiles(target, relPath) {
  const results = [];
  if (!existsSync(target)) return results;
  const s = statSync(target);
  if (s.isFile()) {
    try { results.push({ path: relPath, content: readFileSync(target, "utf8") }); } catch {}
    return results;
  }
  for (const entry of readdirSync(target)) {
    if (SKIP_DIRS.has(entry)) continue;
    collectFiles(join(target, entry), `${relPath}/${entry}`);
    const child = join(target, entry);
    const childRel = `${relPath}/${entry}`;
    if (statSync(child).isDirectory()) results.push(...collectFiles(child, childRel));
    else { try { results.push({ path: childRel, content: readFileSync(child, "utf8") }); } catch {} }
  }
  return results;
}

const files = [];
for (const inc of INCLUDE) {
  const full = join(BASE, inc);
  if (!existsSync(full)) continue;
  const s = statSync(full);
  if (s.isFile()) {
    try { files.push({ path: inc, content: readFileSync(full, "utf8") }); } catch {}
  } else {
    files.push(...collectFiles(full, inc));
  }
}
console.log(`Collected ${files.length} files`);

async function gh(method, endpoint, body) {
  const r = await fetch(`https://api.github.com${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`${method} ${endpoint} → ${r.status}: ${t}`);
  }
  return r.json();
}

// Check if main branch already exists
let parentShas = [];
try {
  const ref = await gh("GET", `/repos/${OWNER}/${REPO}/git/refs/heads/main`);
  parentShas = [ref.object.sha];
  console.log("Existing main branch found, will update");
} catch {
  console.log("New repo, creating initial commit");
}

// Create blobs (batch, but sequentially to avoid rate limit)
console.log("Creating blobs...");
const treeItems = [];
for (const f of files) {
  try {
    const b = await gh("POST", `/repos/${OWNER}/${REPO}/git/blobs`, {
      content: Buffer.from(f.content).toString("base64"),
      encoding: "base64",
    });
    treeItems.push({ path: f.path, mode: "100644", type: "blob", sha: b.sha });
  } catch (e) {
    console.warn(`Skip ${f.path}: ${e.message}`);
  }
}
console.log(`Blobs created: ${treeItems.length}`);

const tree = await gh("POST", `/repos/${OWNER}/${REPO}/git/trees`, { tree: treeItems });
console.log("Tree:", tree.sha);

const commit = await gh("POST", `/repos/${OWNER}/${REPO}/git/commits`, {
  message: "Initial commit: Production-ready MCP server for coding workflows",
  tree: tree.sha,
  parents: parentShas,
});
console.log("Commit:", commit.sha);

if (parentShas.length === 0) {
  const ref = await gh("POST", `/repos/${OWNER}/${REPO}/git/refs`, {
    ref: "refs/heads/main",
    sha: commit.sha,
  });
  console.log("Created branch:", ref.ref);
} else {
  await gh("PATCH", `/repos/${OWNER}/${REPO}/git/refs/heads/main`, {
    sha: commit.sha,
    force: false,
  });
  console.log("Updated main branch");
}

console.log(`\nDone! https://github.com/${OWNER}/${REPO}`);
