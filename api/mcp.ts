/**
 * Copyright 2026 @kenlim5656. All rights reserved.
 * Licensed under the Business Source License 1.1 (BSL 1.1)
 * Persistent Attribution Required. See /LICENSE and /NOTICE for terms.
 * Central Suite Repository: https://github.com/kenlim5656/paid-media-suite
 */

/**
 * api/mcp.ts — Vercel serverless entry point (StreamableHTTP transport)
 *
 * Deployed at: https://<your-domain>/api/mcp
 *
 * Required env vars (set in Vercel dashboard):
 *   MCP_API_KEY                          — bearer token clients must present
 *                                          (generate: openssl rand -hex 32)
 *   PAID_MEDIA_GCP_PROJECT               — GCP project ID
 *   PAID_MEDIA_BQ_DATASET                — dataset name (default: "paid_media")
 *   GOOGLE_APPLICATION_CREDENTIALS_JSON  — service account JSON, raw or base64.
 *                                          Scope this service account to the ONE
 *                                          dataset with roles/bigquery.dataViewer
 *                                          + roles/bigquery.jobUser only — it is
 *                                          a read surface; never grant dataEditor,
 *                                          and never log the credential object.
 *   PAID_MEDIA_AGENT_URL                 — Cloud Run agent base URL
 *
 * Optional:
 *   PAID_MEDIA_DATA_DIR        — override data directory (default: "./data")
 *   MCP_ALLOW_UNAUTHENTICATED  — "true" to explicitly run without MCP_API_KEY
 *                                (local testing only; never on a public URL)
 *
 * Legacy names BIGQUERY_PROJECT_ID / BIGQUERY_DATASET_ID still work but log
 * a deprecation warning (see src/config.ts). Setting old and new names to
 * conflicting values fails at startup.
 *
 * Claude Code settings.json entry:
 *   {
 *     "mcpServers": {
 *       "paid-media": {
 *         "type": "http",
 *         "url": "https://<your-domain>/api/mcp",
 *         "headers": {
 *           "Authorization": "Bearer <your MCP_API_KEY value>"
 *         }
 *       }
 *     }
 *   }
 */

import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { buildAdapter, createServer } from "../src/server.js";

// ── Adapter — initialized once per cold start, reused across warm invocations ─
const adapter = buildAdapter();

// ── Auth ───────────────────────────────────────────────────────────────────────
// Every request must present `Authorization: Bearer <MCP_API_KEY>`. Without it,
// any POST to the public URL would reach all tools, including agent triggers
// and media actions. Fail closed when MCP_API_KEY is unset unless the operator
// explicitly opts out via MCP_ALLOW_UNAUTHENTICATED=true.

function isAuthorized(req: IncomingMessage): { ok: boolean; reason?: string } {
  const key = process.env.MCP_API_KEY;
  if (!key) {
    if (process.env.MCP_ALLOW_UNAUTHENTICATED === "true") {
      console.error(
        "[paid-media-mcp] WARNING: serving without authentication (MCP_ALLOW_UNAUTHENTICATED=true)"
      );
      return { ok: true };
    }
    return {
      ok: false,
      reason:
        "Server is not configured: set the MCP_API_KEY env var (clients then send " +
        "'Authorization: Bearer <key>'), or set MCP_ALLOW_UNAUTHENTICATED=true for local testing.",
    };
  }
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  const presented = Buffer.from(token);
  const expected = Buffer.from(key);
  if (presented.length !== expected.length || !timingSafeEqual(presented, expected)) {
    return { ok: false, reason: "Unauthorized" };
  }
  return { ok: true };
}

// ── Request body parser ────────────────────────────────────────────────────────

async function readBody(req: IncomingMessage): Promise<unknown> {
  if (req.method !== "POST") return undefined;
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf-8");
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

// ── Vercel handler ─────────────────────────────────────────────────────────────

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  // Health check — lets Vercel confirm the function is alive (no auth: it
  // exposes nothing beyond liveness)
  if (req.method === "GET" && req.url === "/api/mcp/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", server: "paid-media-mcp", version: "2.0.0" }));
    return;
  }

  const auth = isAuthorized(req);
  if (!auth.ok) {
    res.writeHead(401, {
      "Content-Type": "application/json",
      "WWW-Authenticate": "Bearer",
    });
    res.end(JSON.stringify({ error: auth.reason }));
    return;
  }

  try {
    const body = await readBody(req);

    // New server + transport per request — correct stateless pattern for serverless.
    // The adapter (above) is shared and safe to reuse (no per-request state).
    const server = createServer(adapter);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless mode — required for serverless
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch (err) {
    console.error("[paid-media-mcp] Handler error:", err);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal server error" }));
    }
  }
}

// Tell Vercel not to parse the body — we do it ourselves so MCP gets raw access
export const config = { api: { bodyParser: false } };
