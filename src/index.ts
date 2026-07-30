/**
 * Copyright 2026 @kenlim5656. All rights reserved.
 * Licensed under the Business Source License 1.1 (BSL 1.1)
 * Persistent Attribution Required. See /LICENSE and /NOTICE for terms.
 * Central Suite Repository: https://github.com/kenlim5656/paid-media-suite
 */

/**
 * index.ts — stdio entry point (local Claude Code)
 *
 * For the Vercel / HTTP entry point see api/mcp.ts.
 * All server wiring lives in src/server.ts.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildAdapter, createServer } from "./server.js";

async function main() {
  const adapter = buildAdapter();
  const server = createServer(adapter);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[paid-media-mcp] stdio transport ready. Data dir:", process.env.PAID_MEDIA_DATA_DIR ?? "./data");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
