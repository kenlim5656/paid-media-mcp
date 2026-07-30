/**
 * Copyright 2026 @kenlim5656. All rights reserved.
 * Licensed under the Business Source License 1.1 (BSL 1.1)
 * Persistent Attribution Required. See /LICENSE and /NOTICE for terms.
 * Central Suite Repository: https://github.com/kenlim5656/paid-media-suite
 */
import { z } from "zod";
import type { PaidMediaAdapter } from "../adapters/base.js";

export const attributionTools = (adapter: PaidMediaAdapter) => [
  {
    name: "list_attribution_models",
    description:
      "List all attribution configurations used by the team: model type (last-click, data-driven, etc.), windows, conversion events, and which platforms each applies to.",
    inputSchema: z.object({}),
    handler: async () => {
      const configs = await adapter.getAttributionConfigurations();
      if (configs.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No attribution configurations defined. Add them to data/attribution-models.json.",
            },
          ],
        };
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ count: configs.length, configurations: configs }, null, 2),
          },
        ],
      };
    },
  },

  {
    name: "get_attribution_model",
    description:
      "Get full details for a specific attribution configuration: model, window, conversion events, cross-device settings, and intended use cases.",
    inputSchema: z.object({
      attribution_id: z.string().describe("The attribution configuration ID"),
    }),
    handler: async (args: { attribution_id: string }) => {
      const config = await adapter.getAttributionConfiguration(args.attribution_id);
      if (!config) {
        return {
          content: [
            {
              type: "text",
              text: `No attribution configuration found with ID: ${args.attribution_id}`,
            },
          ],
        };
      }
      return { content: [{ type: "text", text: JSON.stringify(config, null, 2) }] };
    },
  },

  {
    name: "compare_attribution_models",
    description:
      "Compare two attribution configurations side-by-side to understand how they differ in model type, windows, conversion events, and use cases.",
    inputSchema: z.object({
      attribution_id_a: z.string().describe("First attribution configuration ID"),
      attribution_id_b: z.string().describe("Second attribution configuration ID"),
    }),
    handler: async (args: { attribution_id_a: string; attribution_id_b: string }) => {
      const [a, b] = await Promise.all([
        adapter.getAttributionConfiguration(args.attribution_id_a),
        adapter.getAttributionConfiguration(args.attribution_id_b),
      ]);
      if (!a) {
        return { content: [{ type: "text", text: `Attribution config not found: ${args.attribution_id_a}` }] };
      }
      if (!b) {
        return { content: [{ type: "text", text: `Attribution config not found: ${args.attribution_id_b}` }] };
      }

      const comparison = {
        a: { id: a.id, name: a.name, model: a.model, window: a.window, platforms: a.platforms_applied, conversions: a.conversion_events },
        b: { id: b.id, name: b.name, model: b.model, window: b.window, platforms: b.platforms_applied, conversions: b.conversion_events },
        differences: {
          model: a.model !== b.model,
          click_window: a.window.click !== b.window.click,
          view_window: (a.window.view ?? 0) !== (b.window.view ?? 0),
          cross_device: a.cross_device !== b.cross_device,
          view_through: a.view_through_enabled !== b.view_through_enabled,
        },
      };

      return { content: [{ type: "text", text: JSON.stringify(comparison, null, 2) }] };
    },
  },
];
