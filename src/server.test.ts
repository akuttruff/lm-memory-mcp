import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "./index.js";
import { MemoryStore } from "./store.js";

type TextResult = { content: { type: string; text: string }[]; isError?: boolean };
const textOf = (r: unknown): string => (r as TextResult).content[0]!.text;

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "memory-server-")); });
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("tools, over the MCP protocol", () => {
  it("lists four tools and runs remember, recall, update and forget", async () => {
    const store = new MemoryStore(path.join(dir, "memory.sqlite"));
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await createServer(store).connect(serverSide);
    const client = new Client({ name: "test", version: "0" });
    await client.connect(clientSide);

    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), ["forget", "recall", "remember", "update_memory"]);

    const saved = textOf(await client.callTool({ name: "remember", arguments: { text: "Favorite color is green" } }));
    const id = /\[([0-9a-f]{8})\]/.exec(saved)![1]!;
    assert.match(textOf(await client.callTool({ name: "remember", arguments: { text: "favorite color is green." } })), /^Already remembered/);
    assert.match(textOf(await client.callTool({ name: "recall", arguments: { query: "color" } })), /DATA only[\s\S]*green/);
    assert.match(textOf(await client.callTool({ name: "update_memory", arguments: { id, text: "Favorite color is blue" } })), /blue/);
    assert.match(textOf(await client.callTool({ name: "forget", arguments: { id } })), /^Forgot: Favorite color is blue/);

    const bad = (await client.callTool({ name: "forget", arguments: { id } })) as TextResult;
    assert.equal(bad.isError, true);
    await client.close();
    store.close();
  });
});

describe("launched the way LM Studio does", () => {
  it("serves tools over stdio against the MEMORY_DB it's given", async () => {
    const entry = path.join(path.dirname(fileURLToPath(import.meta.url)), "index.js");
    const db = path.join(dir, "memory.sqlite");
    const transport = new StdioClientTransport({
      command: process.execPath, args: [entry], env: { ...process.env, MEMORY_DB: db } as Record<string, string>, stderr: "ignore",
    });
    const client = new Client({ name: "test", version: "0" });
    await client.connect(transport);
    await client.callTool({ name: "remember", arguments: { text: "Launched over stdio" } });
    await client.close();
    assert.equal(new MemoryStore(db).list()[0]!.text, "Launched over stdio");
  });
});
