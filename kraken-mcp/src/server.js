#!/usr/bin/env node
// kraken-mcp/src/server.js — MCP server registering Kraken read + write tools.
//
// Read tools hit Kraken's API directly.
// Write tools branch on PAPER_TRADING:
//   PAPER_TRADING=1 (default): paper-broker stub logs + returns fake fill
//   PAPER_TRADING=0: throws "live trading not yet implemented" until Phase 1.5

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { KrakenClient } from './kraken-client.js';
import { registerReadTools } from './tools/read.js';
import { registerWriteTools } from './tools/write.js';

// Resolve rules.json from the repo root (two levels up from src/server.js).
// This makes the MCP work regardless of which cwd Claude Code launches it from.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
if (!process.env.RULES_PATH) {
  process.env.RULES_PATH = path.resolve(__dirname, '../../rules.json');
}

const PAPER = process.env.PAPER_TRADING !== '0';

// Print disclaimer to stderr (stdio MCP convention — stdout is JSON-RPC)
process.stderr.write(
  `⚠  kraken-mcp  |  Paper trading: ${PAPER ? 'ON (no real orders)' : 'OFF (LIVE — real money)'}\n`
);
if (!PAPER) {
  process.stderr.write(
    `⚠  kraken-mcp  |  LIVE mode is NOT implemented in Phase 1. Write tools will throw.\n`
  );
}

const kraken = new KrakenClient();

const tools = new Map();
registerReadTools(tools, kraken);
registerWriteTools(tools, kraken, { paper: PAPER });

const server = new Server(
  {
    name: 'kraken',
    version: '0.1.0',
    description: 'Kraken crypto execution — bracket orders gated by rules.json. PAPER_TRADING default.',
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

const transport = new StdioServerTransport();
await server.connect(transport);
