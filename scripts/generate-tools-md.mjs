/**
 * Copyright 2026 @kenlim5656. All rights reserved.
 * Licensed under the Business Source License 1.1 (BSL 1.1)
 * Persistent Attribution Required. See /LICENSE and /NOTICE for terms.
 * Central Suite Repository: https://github.com/kenlim5656/paid-media-suite
 */

/**
 * generate-tools-md.mjs — regenerates TOOLS.md from the actual tool,
 * resource, and prompt registrations so the doc can never drift from the
 * code again (REVIEW Phase 4.4).
 *
 * Usage:   npm run tools:md     (builds first, then runs this)
 *
 * The hand-written "Example conversations" section lives in
 * docs/tools-examples.md and is appended verbatim.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = (p) => join(root, "dist", "src", p);

const { FileAdapter } = await import(dist("adapters/file-adapter.js"));
const { registerResources } = await import(dist("resources/index.js"));
const { prompts } = await import(dist("prompts/index.js"));

// Group labels mirror the registration order in src/server.ts.
const TOOL_GROUPS = [
  ["Campaign tools", "tools/campaigns.js", "campaignTools"],
  ["Team tools", "tools/teams.js", "teamTools"],
  ["Performance tools", "tools/performance.js", "performanceTools"],
  ["Attribution tools", "tools/attribution.js", "attributionTools"],
  ["Reporting tools", "tools/reporting.js", "reportingTools"],
  ["Asset tools", "tools/assets.js", "assetTools"],
  ["Testing tools", "tools/testing.js", "testingTools"],
  ["Audience tools", "tools/audiences.js", "audienceTools"],
  ["Measurement tools", "tools/measurement.js", "measurementTools"],
  ["GMP platform tools", "tools/platforms.js", "platformTools"],
  ["Identity & signal tools", "tools/identity.js", "identityTools"],
  ["Agent integration tools", "tools/agent-outputs.js", "agentOutputTools"],
  ["Analytics & live data tools", "tools/analytics.js", "analyticsTools"],
  ["Media action tools", "tools/media-actions.js", "mediaActionTools"],
  ["Account-based analytics tools", "tools/account-analytics.js", "accountAnalyticsTools"],
  ["Reporting view tools", "tools/reporting-views.js", "reportingViewTools"],
];

const adapter = new FileAdapter(join(root, "data"));

function firstSentence(text) {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  const m = clean.match(/^.*?[.!?](\s|$)/);
  return (m ? m[0] : clean).trim().replace(/\|/g, "\\|");
}

function anchor(label) {
  return label.toLowerCase().replace(/&/g, "").replace(/[^a-z0-9 -]/g, "").trim().replace(/\s+/g, "-");
}

const groups = [];
for (const [label, modulePath, exportName] of TOOL_GROUPS) {
  const mod = await import(dist(modulePath));
  const factory = mod[exportName];
  const tools = factory.length > 0 ? factory(adapter) : factory();
  groups.push({ label, tools });
}

const allResources = registerResources(adapter);
const toolCount = groups.reduce((n, g) => n + g.tools.length, 0);

let md = `# paid-media-mcp — Tools, Resources & Prompts Reference

> **Generated file — do not edit the tool/resource/prompt tables by hand.**
> Regenerate with \`npm run tools:md\`. Edit example conversations in
> \`docs/tools-examples.md\`.

Complete reference for the ${toolCount} tools, ${allResources.length} resources, and ${prompts.length} prompt templates exposed by the paid-media-mcp server. For setup and data configuration, see [README.md](./README.md).

---

## Table of Contents

1. [Tools](#tools)
${groups.map((g) => `   - [${g.label}](#${anchor(g.label)})`).join("\n")}
2. [Resources](#resources)
3. [Prompts](#prompts)
4. [Example conversations](#example-conversations)

---

## Tools

Tools are actions Claude takes to retrieve your data. They are called automatically when relevant, or can be requested explicitly. Tools that query live BigQuery data require BigQuery mode (\`PAID_MEDIA_GCP_PROJECT\` env var set).

`;

for (const { label, tools } of groups) {
  md += `### ${label}\n\n| Tool | What it does |\n|---|---|\n`;
  for (const t of tools) {
    md += `| \`${t.name}\` | ${firstSentence(t.description)} |\n`;
  }
  md += "\n";
}

md += `---

## Resources

Resources are reference documents Claude can read for context (schemas, conventions, contracts).

| Resource URI | Name | Description |
|---|---|---|
`;
for (const r of allResources) {
  md += `| \`${r.uri}\` | ${r.name} | ${firstSentence(r.description)} |\n`;
}

md += `
---

## Prompts

Prompt templates for common workflows — invoke from the prompt picker in Claude.

| Prompt | Description |
|---|---|
`;
for (const p of prompts) {
  md += `| \`${p.name}\` | ${firstSentence(p.description)} |\n`;
}

md += "\n---\n\n";
md += readFileSync(join(root, "docs", "tools-examples.md"), "utf-8");

writeFileSync(join(root, "TOOLS.md"), md);
console.log(
  `TOOLS.md regenerated: ${toolCount} tools, ${allResources.length} resources, ${prompts.length} prompts.`
);
