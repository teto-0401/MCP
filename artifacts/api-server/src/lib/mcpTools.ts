export interface McpTool {
  name: string;
  description: string;
  category: string;
  inputSchema: object;
  callCount: number;
  totalMs: number;
  errorCount: number;
  lastCalledAt: string | null;
}

export const mcpToolRegistry = new Map<string, McpTool>();

export function registerTool(def: Omit<McpTool, "callCount" | "totalMs" | "errorCount" | "lastCalledAt">) {
  mcpToolRegistry.set(def.name, { ...def, callCount: 0, totalMs: 0, errorCount: 0, lastCalledAt: null });
}

export function recordToolCall(name: string, durationMs: number, isError: boolean) {
  const tool = mcpToolRegistry.get(name);
  if (!tool) return;
  tool.callCount++;
  tool.totalMs += durationMs;
  if (isError) tool.errorCount++;
  tool.lastCalledAt = new Date().toISOString();
}

// Register all MCP tools
const tools: Array<Omit<McpTool, "callCount" | "totalMs" | "errorCount" | "lastCalledAt">> = [
  {
    name: "read_file",
    description: "Read the contents of a file at the given path",
    category: "files",
    inputSchema: { type: "object", required: ["path"], properties: { path: { type: "string" }, encoding: { type: "string" } } },
  },
  {
    name: "write_file",
    description: "Write or overwrite a file with provided content",
    category: "files",
    inputSchema: { type: "object", required: ["path", "content"], properties: { path: { type: "string" }, content: { type: "string" }, createDirs: { type: "boolean" } } },
  },
  {
    name: "delete_file",
    description: "Delete a file or directory",
    category: "files",
    inputSchema: { type: "object", required: ["path"], properties: { path: { type: "string" }, recursive: { type: "boolean" } } },
  },
  {
    name: "list_files",
    description: "List files in a directory, optionally recursive",
    category: "files",
    inputSchema: { type: "object", properties: { path: { type: "string" }, recursive: { type: "boolean" }, pattern: { type: "string" } } },
  },
  {
    name: "search_files",
    description: "Search file contents recursively with a pattern",
    category: "files",
    inputSchema: { type: "object", required: ["query"], properties: { query: { type: "string" }, path: { type: "string" }, filePattern: { type: "string" }, caseSensitive: { type: "boolean" }, maxResults: { type: "integer" } } },
  },
  {
    name: "move_file",
    description: "Move or rename a file",
    category: "files",
    inputSchema: { type: "object", required: ["from", "to"], properties: { from: { type: "string" }, to: { type: "string" }, overwrite: { type: "boolean" } } },
  },
  {
    name: "execute_node",
    description: "Execute Node.js code in a sandboxed environment",
    category: "execution",
    inputSchema: { type: "object", required: ["code"], properties: { code: { type: "string" }, timeout: { type: "integer" }, workDir: { type: "string" }, env: { type: "object" } } },
  },
  {
    name: "execute_python",
    description: "Execute Python code in a sandboxed environment",
    category: "execution",
    inputSchema: { type: "object", required: ["code"], properties: { code: { type: "string" }, timeout: { type: "integer" }, workDir: { type: "string" }, env: { type: "object" } } },
  },
  {
    name: "execute_bash",
    description: "Execute a Bash script in a sandboxed environment",
    category: "execution",
    inputSchema: { type: "object", required: ["code"], properties: { code: { type: "string" }, timeout: { type: "integer" }, workDir: { type: "string" } } },
  },
  {
    name: "run_terminal",
    description: "Execute a shell command in a terminal session",
    category: "terminal",
    inputSchema: { type: "object", required: ["command"], properties: { command: { type: "string" }, sessionId: { type: "string" }, timeout: { type: "integer" }, workDir: { type: "string" } } },
  },
  {
    name: "git_status",
    description: "Get git repository status",
    category: "git",
    inputSchema: { type: "object", properties: { path: { type: "string" } } },
  },
  {
    name: "git_commit",
    description: "Stage and commit changes to the git repository",
    category: "git",
    inputSchema: { type: "object", required: ["message"], properties: { message: { type: "string" }, files: { type: "array", items: { type: "string" } }, all: { type: "boolean" } } },
  },
  {
    name: "git_diff",
    description: "Get diff of staged or unstaged changes",
    category: "git",
    inputSchema: { type: "object", properties: { path: { type: "string" }, staged: { type: "boolean" }, file: { type: "string" } } },
  },
  {
    name: "git_log",
    description: "Get commit history for a repository",
    category: "git",
    inputSchema: { type: "object", properties: { path: { type: "string" }, limit: { type: "integer" }, branch: { type: "string" } } },
  },
  {
    name: "install_package",
    description: "Install a package using npm, pip, or other package managers",
    category: "packages",
    inputSchema: { type: "object", required: ["name"], properties: { name: { type: "string" }, version: { type: "string" }, manager: { type: "string" }, dev: { type: "boolean" }, path: { type: "string" } } },
  },
  {
    name: "list_packages",
    description: "List installed packages in the project",
    category: "packages",
    inputSchema: { type: "object", properties: { manager: { type: "string" }, path: { type: "string" } } },
  },
  {
    name: "get_env",
    description: "Get environment variable keys",
    category: "environment",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "set_env",
    description: "Set an environment variable",
    category: "environment",
    inputSchema: { type: "object", required: ["key", "value"], properties: { key: { type: "string" }, value: { type: "string" }, redacted: { type: "boolean" } } },
  },
];

tools.forEach(registerTool);
