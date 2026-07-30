/**
 * Copyright 2026 @kenlim5656. All rights reserved.
 * Licensed under the Business Source License 1.1 (BSL 1.1)
 * Persistent Attribution Required. See /LICENSE and /NOTICE for terms.
 * Central Suite Repository: https://github.com/kenlim5656/paid-media-suite
 */
import { z } from "zod";
import type { PaidMediaAdapter } from "../adapters/base.js";

export const identityTools = (adapter: PaidMediaAdapter) => [

  {
    name: "list_identity_namespaces",
    description:
      "List all registered identity signal types from the shared schema namespace registry. " +
      "Covers platform click IDs (gclid, fbclid, li_fat_id, ttclid, etc.), analytics cookies " +
      "(GA4 client_id, Adobe ECID, Segment), CRM IDs, hashed first-party signals (email SHA-256, " +
      "phone), and custom org-defined identifiers. Filter by category to get a focused list. " +
      "Use this to understand what signals are available for identity stitching.",
    inputSchema: z.object({
      category: z
        .enum([
          "platform_click_id",
          "platform_cookie",
          "platform_user_id",
          "analytics_cookie",
          "analytics_user_id",
          "analytics_session_id",
          "crm_id",
          "first_party_hashed",
          "first_party_raw",
          "device_id",
          "network",
          "cohort",
          "custom",
        ])
        .optional()
        .describe("Filter to a specific signal category"),
      platform: z.string().optional().describe("Filter to namespaces relevant to a specific platform, e.g. 'meta', 'google_ads', 'linkedin'"),
    }),
    handler: async (args: { category?: string; platform?: string }) => {
      let namespaces = await adapter.getIdentityNamespaces(args.category);

      if (args.platform) {
        namespaces = namespaces.filter(
          (n) => n.platforms.includes(args.platform!) || n.platforms.length === 0
        );
      }

      if (namespaces.length === 0) {
        return {
          content: [{
            type: "text",
            text: "No identity namespaces found. Ensure PAID_MEDIA_SCHEMA_DIR points to the paid-media-schema repo, or copy namespaces/identity_namespaces.json into your data/ directory.",
          }],
        };
      }

      const summary = namespaces.map((n) => ({
        namespace_id:    n.namespace_id,
        display_name:    n.display_name,
        category:        n.category,
        vendor:          n.vendor,
        deterministic:   n.deterministic,
        pii:             n.pii,
        lifetime_days:   n.lifetime_days,
        capture_method:  n.capture_method,
        platforms:       n.platforms,
      }));

      return {
        content: [{
          type: "text",
          text: JSON.stringify({ count: summary.length, namespaces: summary }, null, 2),
        }],
      };
    },
  },

  {
    name: "get_identity_namespace",
    description:
      "Get full details for a specific identity signal namespace, including capture method, " +
      "lifetime, PII status, which platforms use it, and implementation notes. " +
      "Useful when setting up a new signal or diagnosing a stitching gap.",
    inputSchema: z.object({
      namespace_id: z.string().describe(
        "The namespace ID, e.g. 'platform_click_id.google.gclid' or 'analytics_cookie.google.ga4_client_id'"
      ),
    }),
    handler: async (args: { namespace_id: string }) => {
      const ns = await adapter.getIdentityNamespace(args.namespace_id);
      if (!ns) {
        return {
          content: [{
            type: "text",
            text: `Namespace not found: ${args.namespace_id}. Use list_identity_namespaces to see all registered namespaces.`,
          }],
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(ns, null, 2) }],
      };
    },
  },

  {
    name: "get_identity_signal_coverage",
    description:
      "Review which identity signal namespaces are active for a given set of platforms and " +
      "identify gaps in coverage. For example: 'we run Meta and LinkedIn — which signals should " +
      "we be capturing and which are we missing?' Returns a coverage map with implementation " +
      "priority for each missing signal.",
    inputSchema: z.object({
      platforms: z.array(z.string()).describe(
        "Platforms to check coverage for, e.g. ['meta', 'linkedin', 'google_ads', 'ga4']"
      ),
    }),
    handler: async (args: { platforms: string[] }) => {
      const allNamespaces = await adapter.getIdentityNamespaces();
      const targetPlatforms = new Set(args.platforms);

      const relevant = allNamespaces.filter(
        (n) => n.platforms.some((p) => targetPlatforms.has(p)) || n.platforms.length === 0
      );

      const byCategory: Record<string, typeof relevant> = {};
      for (const ns of relevant) {
        if (!byCategory[ns.category]) byCategory[ns.category] = [];
        byCategory[ns.category].push(ns);
      }

      const coverageReport = {
        platforms_checked: args.platforms,
        total_relevant_namespaces: relevant.length,
        deterministic_signals: relevant.filter((n) => n.deterministic).length,
        pii_signals_excluded: relevant.filter((n) => n.pii).length,
        by_category: Object.entries(byCategory).map(([category, namespaces]) => ({
          category,
          count: namespaces.length,
          signals: namespaces.map((n) => ({
            namespace_id:  n.namespace_id,
            display_name:  n.display_name,
            deterministic: n.deterministic,
            pii:           n.pii,
            capture_method: n.capture_method,
          })),
        })),
        implementation_priority: [
          ...relevant.filter((n) => n.deterministic && !n.pii),
          ...relevant.filter((n) => !n.deterministic && !n.pii),
        ].slice(0, 10).map((n) => ({
          namespace_id: n.namespace_id,
          display_name: n.display_name,
          why:          n.deterministic ? "Deterministic — highest stitching confidence" : "Probabilistic — adds corroborating evidence",
        })),
      };

      return {
        content: [{ type: "text", text: JSON.stringify(coverageReport, null, 2) }],
      };
    },
  },

];
