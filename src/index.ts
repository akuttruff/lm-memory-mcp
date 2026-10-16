#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { MemoryError, MemoryStore, describe, wrapAsData } from "./store.js";

const TOOLS = [
  {
    name: "remember",
    description:
      "Save one durable fact about the user for future conversations: preferences, birth details, people in their life, " +
      "ongoing situations, how they like answers. One fact per call, written as a short standalone sentence " +
      "(\"The user has a younger sister named Mara who lives in Lisbon\"). " +
      "Don't save small talk, one-off questions, or anything that's only true for this conversation. " +
      "If a fact already saved has changed, use update_memory on it instead of saving a second, conflicting one.",
    inputSchema: {
      type: "object" as const,
      properties: {
        text: { type: "string", description: "The fact, as one short standalone sentence." },
      },
      required: ["text"],
    },
    annotations: { title: "Remember a fact", readOnlyHint: false, openWorldHint: false },
  },
  {
    name: "recall",
    description:
      "Search what's been saved about the user. The most relevant saved facts are already in your instructions, " +
      "so use this only to look for something specific that isn't there, or to find a memory's id before " +
      "update_memory or forget. With no query, returns the most recent memories.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Words to look for, e.g. \"birth chart\" or \"sister\". Omit for the most recent." },
      },
    },
    annotations: { title: "Recall memories", readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "update_memory",
    description:
      "Replace a saved memory's text, when a fact has changed or was saved wrong. Needs the memory's id, " +
      "shown in brackets in your instructions and in recall results, e.g. [3fa9c01b].",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "The memory's id, without brackets." },
        text: { type: "string", description: "The corrected fact, as one short standalone sentence." },
      },
      required: ["id", "text"],
    },
    annotations: { title: "Update a memory", readOnlyHint: false, openWorldHint: false },
  },
  {
    name: "forget",
    description:
      "Delete a saved memory: when the user asks you to forget something, or a memory is simply wrong or no longer " +
      "true and there's nothing to replace it with (otherwise use update_memory). Needs the memory's id.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "The memory's id, without brackets." },
      },
      required: ["id"],
    },
    annotations: { title: "Forget a memory", readOnlyHint: false, openWorldHint: false },
  },
];

const text = (t: string, isError = false) => ({ content: [{ type: "text" as const, text: t }], ...(isError ? { isError } : {}) });

export function createServer(store: MemoryStore): Server {
  const server = new Server({ name: "memory", version: "1.0.0" }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const a = (args ?? {}) as Record<string, unknown>;
    try {
      switch (name) {
        case "remember": {
          const { memory, duplicate } = store.remember(a["text"]);
          return text(duplicate ? `Already remembered: ${describe(memory)}` : `Remembered: ${describe(memory)}`);
        }
        case "recall": {
          const found = store.recall(a["query"]);
          if (!found.length) return text(a["query"] ? "No saved memories match that." : "Nothing has been remembered yet.");
          return text(wrapAsData("recall", found.map(describe).join("\n")));
        }
        case "update_memory":
          return text(`Updated: ${describe(store.update(a["id"], a["text"]))}`);
        case "forget":
          return text(`Forgot: ${store.forget(a["id"]).text}`);
        default:
          return text(`Unknown tool: ${name}`, true);
      }
    } catch (err) {
      if (err instanceof MemoryError) return text(err.message, true);
      throw err;
    }
  });

  return server;
}

async function main(): Promise<void> {
  const store = new MemoryStore();
  await createServer(store).connect(new StdioServerTransport());
  // stdout is the protocol channel; anything human-readable goes to stderr.
  console.error("memory MCP server running on stdio");
}

// Run when launched directly (by LM Studio), not when imported by a test.
const launched = process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (launched) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
