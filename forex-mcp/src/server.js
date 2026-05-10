#!/usr/bin/env node
// forex-mcp/src/server.js — MCP server for forex/CFD execution via cTrader.
//
// Same shape as kraken-mcp/src/server.js. PAPER_TRADING=1 default.
// Read tools auth on first call; write tools delegate to paper-broker in paper mode.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { registerReadTools } from './tools/read.js';
import { registerWriteTools } from './tools/write.js';
import { closeCTrader } from './ctrader-client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env from repo root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Make rules.json discoverable regardless of cwd
if (!process.env.RULES_PATH) {
  process.env.RULES_PATH = path.resolve(__dirname, '../../rules.json');
}

const PAPER = process.env.PAPER_TRADING !== '0';

process.stderr.write(
  `⚠  forex-mcp  |  Paper trading: ${PAPER ? 'ON (no real orders)' : 'OFF (LIVE — real money)'}\n`
);
if (!PAPER) {
  process.stderr.write(
    `⚠  forex-mcp  |  LIVE mode is NOT implemented in Phase 2a. Write tools will throw.\n`
  );
}

const tools = new Map();
registerReadTools(tools);
registerWriteTools(tools, { paper: PAPER });

const server = new Server(
  {
    name: 'forex',
    version: '0.1.0',
    description: 'Forex/CFD execution via cTrader Open API. Bracket orders gated by rules.json. PAPER_TRADING default.',
  },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [...tools.values()].map(t => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const tool = tools.get(req.params.name);
  if (!tool) throw new Error(`Unknown tool: ${req.params.name}`);
  try {
    const result = await tool.handler(req.params.arguments || {});
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ success: false, error: err.message }, null, 2) }],
      isError: true,
    };
  }
});

// Clean shutdown
async function shutdown() {
  await closeCTrader();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

const transport = new StdioServerTransport();
await server.connect(transport);
