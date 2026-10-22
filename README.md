# lm-memory-mcp

lm-memory-mcp gives a local model a memory that lasts. It is a small MCP
server that LM Studio (or any MCP host) launches over stdio, and it hands
the model four tools and a SQLite file for keeping durable facts about the
user across conversations.

## Tools

- `remember` saves one fact as a short standalone sentence.
- `recall` finds facts by words, or lists the most recent.
- `update_memory` corrects a saved fact by id.
- `forget` removes one.

Facts are plain rows, so a chat client can read the same file to put them in
the system prompt or show them on a memories screen. This package owns the
schema; readers only read and edit rows.

## Setup

Node 22 or newer.

```bash
npm install
npm run build      # compiles to dist/
npm test           # builds, then runs the node:test suites
```

Register it with LM Studio in `~/.lmstudio/mcp.json`:

```json
{
  "mcpServers": {
    "memory": {
      "command": "node",
      "args": ["/path/to/lm-memory-mcp/dist/index.js"],
      "env": { "MEMORY_DB": "/path/to/memory.sqlite" }
    }
  }
}
```

`MEMORY_DB` is optional. Without it the file is `~/.lm-memory/memory.sqlite`.
