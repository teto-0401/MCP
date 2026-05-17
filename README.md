# Replit MCP Server

A production-ready **Model Context Protocol (MCP)** server for coding workflows on Replit. Designed for seamless integration with Claude Desktop and other MCP-compatible coding agents.

## Features

- **File Management** — Read, write, delete, move, list, and search files recursively
- **Code Execution** — Sandboxed execution for Node.js, Python, and Bash with timeout controls
- **Terminal Sessions** — Persistent terminal session management with safety controls
- **Git Integration** — Status, log, diff, commit, and branch management
- **Package Management** — Install/uninstall npm, pip, and yarn packages
- **Environment Variables** — Secure storage with optional value redaction
- **API Key Authentication** — Create, revoke, and manage API keys with per-key permissions
- **Rate Limiting** — Per-IP and per-key rate limiting with configurable windows
- **Audit Logging** — Full request audit trail with tool name, level, and metadata
- **WebSocket Streaming** — Real-time output streaming for long-running executions
- **Monitoring Dashboard** — Live metrics, connection tracking, and tool usage stats
- **MCP Protocol** — Claude Desktop compatible `/api/mcp/tools` manifest and tool call endpoint

## Quick Start

### On Replit

The server starts automatically. Access the dashboard at your Replit preview URL.

### Local with Docker

```bash
git clone <your-repo>
cd <your-repo>

# Start database and API server
docker-compose up -d

# The API is now available at http://localhost:5000
```

### Local without Docker

```bash
# Install dependencies
pnpm install

# Set required environment variables
export DATABASE_URL="postgresql://user:password@localhost:5432/mcpserver"
export PORT=5000

# Push database schema
pnpm --filter @workspace/db run push

# Start the API server
pnpm --filter @workspace/api-server run dev
```

## Claude Desktop Configuration

Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "replit-mcp": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/client-http"],
      "env": {
        "MCP_SERVER_URL": "https://your-replit-url.replit.app/api/mcp",
        "MCP_API_KEY": "mcp_your_api_key_here"
      }
    }
  }
}
```

Or use the SSE transport directly:

```json
{
  "mcpServers": {
    "replit-mcp": {
      "url": "https://your-replit-url.replit.app/api/mcp/tools",
      "headers": {
        "X-API-Key": "mcp_your_api_key_here"
      }
    }
  }
}
```

## API Reference

### Authentication

All endpoints accept an API key via:
- `X-API-Key: mcp_your_key` header
- `Authorization: Bearer mcp_your_key` header

Create your first API key (no auth required for initial setup):

```bash
curl -X POST http://localhost:5000/api/auth/keys \
  -H "Content-Type: application/json" \
  -d '{"name": "My Agent", "permissions": ["read", "write", "execute"]}'
```

### File Operations

```bash
# List files
curl "http://localhost:5000/api/files?path=.&recursive=true"

# Read file
curl "http://localhost:5000/api/files/read?path=src/index.ts"

# Write file
curl -X POST http://localhost:5000/api/files/write \
  -H "Content-Type: application/json" \
  -d '{"path": "hello.js", "content": "console.log(\"hello\")"}'

# Search files
curl "http://localhost:5000/api/files/search?query=TODO&filePattern=*.ts"

# Delete file
curl -X DELETE "http://localhost:5000/api/files/delete?path=hello.js"
```

### Code Execution

```bash
# Run Node.js
curl -X POST http://localhost:5000/api/execute \
  -H "Content-Type: application/json" \
  -d '{"language": "node", "code": "console.log(2 + 2)", "timeout": 10}'

# Run Python
curl -X POST http://localhost:5000/api/execute \
  -H "Content-Type: application/json" \
  -d '{"language": "python", "code": "print(\"hello from python\")", "timeout": 10}'

# Run Bash
curl -X POST http://localhost:5000/api/execute \
  -H "Content-Type: application/json" \
  -d '{"language": "bash", "code": "ls -la && echo done", "timeout": 10}'
```

### Git

```bash
# Get status
curl http://localhost:5000/api/git/status

# View commit log
curl "http://localhost:5000/api/git/log?limit=10"

# Commit changes
curl -X POST http://localhost:5000/api/git/commit \
  -H "Content-Type: application/json" \
  -d '{"message": "feat: add new feature", "all": true}'
```

### MCP Protocol

```bash
# Get tools manifest (for Claude Desktop)
curl http://localhost:5000/api/mcp/tools

# Call a tool
curl -X POST http://localhost:5000/api/mcp/tools/call \
  -H "Content-Type: application/json" \
  -d '{"name": "read_file", "arguments": {"path": "README.md"}}'
```

### Monitoring

```bash
# Server stats
curl http://localhost:5000/api/monitoring/stats

# Active connections
curl http://localhost:5000/api/monitoring/connections

# Rate limit status
curl http://localhost:5000/api/monitoring/rate-limits

# All MCP tools with usage
curl http://localhost:5000/api/monitoring/tools
```

## MCP Tools Available

| Tool | Category | Description |
|------|----------|-------------|
| `read_file` | files | Read file contents |
| `write_file` | files | Write or overwrite a file |
| `delete_file` | files | Delete a file or directory |
| `list_files` | files | List directory contents |
| `search_files` | files | Recursive content search |
| `move_file` | files | Move or rename a file |
| `execute_node` | execution | Run Node.js code |
| `execute_python` | execution | Run Python code |
| `execute_bash` | execution | Run Bash script |
| `run_terminal` | terminal | Execute shell command |
| `git_status` | git | Repository status |
| `git_commit` | git | Stage and commit changes |
| `git_diff` | git | View code diff |
| `git_log` | git | Commit history |
| `install_package` | packages | Install npm/pip package |
| `list_packages` | packages | List installed packages |
| `get_env` | environment | List env variable keys |
| `set_env` | environment | Set env variable |

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `PORT` | Yes | 5000 | Server port |
| `NODE_ENV` | No | development | Environment |
| `WORK_DIR` | No | cwd | Base directory for file ops |
| `SESSION_SECRET` | No | — | Session signing secret |
| `LOG_LEVEL` | No | info | Logging level |

## Safety Controls

The server implements several safety controls for code execution:

- **Blocked patterns**: `rm -rf /`, `shutdown`, `reboot`, `mkfs`, `dd if=`, fork bombs
- **Execution timeout**: All code execution has a configurable timeout (default 30s)
- **Path traversal protection**: File operations are sandboxed to `WORK_DIR`
- **Rate limiting**: 200 requests per minute per IP by default
- **Output size limit**: 1MB stdout/stderr buffer

## WebSocket Streaming

Connect to `/ws` for real-time execution output streaming:

```javascript
const ws = new WebSocket("wss://your-server.replit.app/ws");
ws.send(JSON.stringify({
  type: "execute",
  language: "bash",
  code: "for i in $(seq 1 10); do echo $i; sleep 0.5; done"
}));
ws.onmessage = (e) => console.log(JSON.parse(e.data));
```

## Example Client Configurations

### Python Client

```python
import requests

BASE_URL = "http://localhost:5000/api"
API_KEY = "mcp_your_key_here"
HEADERS = {"X-API-Key": API_KEY, "Content-Type": "application/json"}

def read_file(path):
    r = requests.get(f"{BASE_URL}/files/read", params={"path": path}, headers=HEADERS)
    return r.json()["content"]

def run_python(code, timeout=30):
    r = requests.post(f"{BASE_URL}/execute", json={"language": "python", "code": code, "timeout": timeout}, headers=HEADERS)
    return r.json()

def git_status():
    r = requests.get(f"{BASE_URL}/git/status", headers=HEADERS)
    return r.json()
```

### JavaScript/TypeScript Client

```typescript
const BASE_URL = "http://localhost:5000/api";
const API_KEY = "mcp_your_key_here";

const headers = {
  "X-API-Key": API_KEY,
  "Content-Type": "application/json",
};

const mcp = {
  readFile: (path: string) =>
    fetch(`${BASE_URL}/files/read?path=${encodeURIComponent(path)}`, { headers }).then(r => r.json()),

  executeCode: (language: "node" | "python" | "bash", code: string) =>
    fetch(`${BASE_URL}/execute`, {
      method: "POST",
      headers,
      body: JSON.stringify({ language, code }),
    }).then(r => r.json()),

  callTool: (name: string, args: Record<string, unknown>) =>
    fetch(`${BASE_URL}/mcp/tools/call`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name, arguments: args }),
    }).then(r => r.json()),
};
```

## License

MIT
