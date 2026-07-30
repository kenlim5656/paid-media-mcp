/**
 * Copyright 2026 @kenlim5656. All rights reserved.
 * Licensed under the Business Source License 1.1 (BSL 1.1)
 * Persistent Attribution Required. See /LICENSE and /NOTICE for terms.
 * Central Suite Repository: https://github.com/kenlim5656/paid-media-suite
 */

/**
 * server.ts — shared MCP server factory
 *
 * Exports buildAdapter() and createServer(adapter) so both transports can use
 * the same server configuration:
 *   - src/index.ts  → StdioServerTransport  (local Claude Code)
 *   - api/mcp.ts    → StreamableHTTPServerTransport (Vercel / remote)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { dataDir, resolveBqEnv, validateEnv } from "./config.js";
import { FileAdapter } from "./adapters/file-adapter.js";
import { BigQueryAdapter } from "./adapters/bigquery-adapter.js";
import { campaignTools } from "./tools/campaigns.js";
import { teamTools } from "./tools/teams.js";
import { performanceTools } from "./tools/performance.js";
import { attributionTools } from "./tools/attribution.js";
import { reportingTools } from "./tools/reporting.js";
import { assetTools } from "./tools/assets.js";
import { testingTools } from "./tools/testing.js";
import { audienceTools } from "./tools/audiences.js";
import { measurementTools } from "./tools/measurement.js";
import { platformTools } from "./tools/platforms.js";
import { identityTools } from "./tools/identity.js";
import { agentOutputTools } from "./tools/agent-outputs.js";
import { analyticsTools } from "./tools/analytics.js";
import { mediaActionTools } from "./tools/media-actions.js";
import { accountAnalyticsTools } from "./tools/account-analytics.js";
import { reportingViewTools } from "./tools/reporting-views.js";
import { registerResources } from "./resources/index.js";
import { prompts } from "./prompts/index.js";

// ── Adapter factory ───────────────────────────────────────────────────────────

/**
 * Auto-selects BigQueryAdapter when a GCP project is configured;
 * falls back to FileAdapter for local / file-only setups.
 *
 * BigQuery mode env vars (canonical — legacy BIGQUERY_PROJECT_ID /
 * BIGQUERY_DATASET_ID still accepted, see src/config.ts):
 *   PAID_MEDIA_GCP_PROJECT           — GCP project ID (required for BQ mode)
 *   PAID_MEDIA_BQ_DATASET            — dataset name (default: "paid_media")
 *   GOOGLE_APPLICATION_CREDENTIALS_JSON — service account JSON, raw or base64
 *                                        (required on Vercel / non-GCP hosts;
 *                                         omit on Cloud Run to use ADC)
 *
 * Shared env vars:
 *   PAID_MEDIA_DATA_DIR  — path to JSON data directory (default: "./data")
 *   PAID_MEDIA_AGENT_URL — base URL of deployed paid-media-agent Cloud Run service
 */
export function buildAdapter(): FileAdapter | BigQueryAdapter {
  validateEnv(); // throws on broken config — fail at startup, not query time
  const { projectId, dataset } = resolveBqEnv();
  const dir = dataDir();
  if (projectId) {
    console.error(`[paid-media-mcp] BigQueryAdapter (project: ${projectId})`);
    return new BigQueryAdapter({ projectId, dataset, dataDir: dir });
  }
  console.error(`[paid-media-mcp] FileAdapter (data dir: ${dir})`);
  return new FileAdapter(dir);
}

// ── Server factory ────────────────────────────────────────────────────────────

/**
 * Creates a fully configured MCP Server instance.
 * Call once per cold-start (stdio) or once per request (HTTP/stateless).
 */
export function createServer(adapter: FileAdapter | BigQueryAdapter): Server {
  // ── Tools ──────────────────────────────────────────────────────────────────
  const allTools = [
    ...campaignTools(adapter),
    ...teamTools(adapter),
    ...performanceTools(adapter),
    ...attributionTools(adapter),
    ...reportingTools(adapter),
    ...assetTools(adapter),
    ...testingTools(adapter),
    ...audienceTools(adapter),
    ...measurementTools(adapter),
    ...platformTools(adapter),
    ...identityTools(adapter),
    ...agentOutputTools(adapter),
    ...analyticsTools(adapter),
    ...mediaActionTools(adapter),
    ...accountAnalyticsTools(adapter),
    ...reportingViewTools(),
  ];
  const toolMap = new Map(allTools.map((t) => [t.name, t]));

  // ── Resources ──────────────────────────────────────────────────────────────
  const allResources = registerResources(adapter);
  const resourceMap = new Map(allResources.map((r) => [r.uri, r]));

  // ── Prompts ────────────────────────────────────────────────────────────────
  const promptMap = new Map(prompts.map((p) => [p.name, p]));

  // ── Server ─────────────────────────────────────────────────────────────────
  const server = new Server(
    { name: "paid-media-mcp", version: "2.0.0" },
    { capabilities: { tools: {}, resources: {}, prompts: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: allTools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: zodToJsonSchema(t.inputSchema),
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = toolMap.get(request.params.name);
    if (!tool) {
      throw new McpError(ErrorCode.MethodNotFound, `Tool not found: ${request.params.name}`);
    }
    try {
      const parsed = tool.inputSchema.parse(request.params.arguments ?? {});
      return await tool.handler(parsed as never);
    } catch (err) {
      if (err instanceof z.ZodError) {
        throw new McpError(ErrorCode.InvalidParams, `Invalid arguments: ${err.message}`);
      }
      throw new McpError(
        ErrorCode.InternalError,
        `Tool error: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: allResources.map((r) => ({
      uri: r.uri,
      name: r.name,
      description: r.description,
      mimeType: r.mimeType,
    })),
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const resource = resourceMap.get(request.params.uri);
    if (!resource) {
      throw new McpError(ErrorCode.InvalidRequest, `Resource not found: ${request.params.uri}`);
    }
    const text = await resource.handler();
    return { contents: [{ uri: request.params.uri, mimeType: resource.mimeType, text }] };
  });

  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: prompts.map((p) => ({
      name: p.name,
      description: p.description,
      arguments: p.arguments,
    })),
  }));

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const prompt = promptMap.get(request.params.name);
    if (!prompt) {
      throw new McpError(ErrorCode.InvalidRequest, `Prompt not found: ${request.params.name}`);
    }
    const args = (request.params.arguments ?? {}) as Record<string, string>;
    return {
      description: prompt.description,
      messages: [
        {
          role: "user",
          content: { type: "text", text: prompt.handler(args) },
        },
      ],
    };
  });

  return server;
}

// ── Zod → JSON Schema (minimal, covers all input types used) ──────────────────

export function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  if (schema instanceof z.ZodObject) {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, value] of Object.entries(schema.shape as Record<string, z.ZodTypeAny>)) {
      properties[key] = zodToJsonSchema(value);
      if (!(value instanceof z.ZodOptional)) required.push(key);
    }
    return { type: "object", properties, required: required.length ? required : undefined };
  }
  if (schema instanceof z.ZodOptional) return zodToJsonSchema(schema.unwrap());
  if (schema instanceof z.ZodEnum) return { type: "string", enum: schema.options };
  if (schema instanceof z.ZodString) {
    const result: Record<string, unknown> = { type: "string" };
    const desc = schema.description;
    if (desc) result.description = desc;
    return result;
  }
  if (schema instanceof z.ZodNumber) return { type: "number" };
  if (schema instanceof z.ZodBoolean) return { type: "boolean" };
  return {};
}

// Note: z.string().describe("...") uses Zod's native .describe() which sets
// _def.description. The zodToJsonSchema function reads schema.description (a
// getter over _def.description) — no prototype override needed.
