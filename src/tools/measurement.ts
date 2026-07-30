/**
 * Copyright 2026 @kenlim5656. All rights reserved.
 * Licensed under the Business Source License 1.1 (BSL 1.1)
 * Persistent Attribution Required. See /LICENSE and /NOTICE for terms.
 * Central Suite Repository: https://github.com/kenlim5656/paid-media-suite
 */
import { z } from "zod";
import type { PaidMediaAdapter } from "../adapters/base.js";

export const measurementTools = (adapter: PaidMediaAdapter) => [
  {
    name: "get_measurement_overview",
    description:
      "Get a high-level overview of the full measurement and tracking setup: tag management system, implementation type (client-side/server-side/hybrid), pixel count, conversion API count, and measurement partners.",
    inputSchema: z.object({}),
    handler: async () => {
      const setup = await adapter.getMeasurementSetup();
      const overview = {
        tag_management: {
          system: setup.tag_management.system_name ?? setup.tag_management.system,
          container_id: setup.tag_management.container_id,
          implementation_type: setup.tag_management.implementation_type,
          server_side_endpoint: setup.tag_management.server_side_endpoint,
          notes: setup.tag_management.notes,
        },
        pixel_count: setup.pixels_and_tags?.length ?? 0,
        platforms_with_pixels: [...new Set(setup.pixels_and_tags?.map((p) => p.platform) ?? [])],
        conversion_api_count: setup.conversion_apis?.length ?? 0,
        platforms_with_conversion_apis: [...new Set(setup.conversion_apis?.map((a) => a.platform) ?? [])],
        cm360_configured: !!setup.cm360,
        website_data_capture: {
          data_layer: setup.website_data_capture.data_layer_implemented,
          first_party_cookies: setup.website_data_capture.first_party_cookies_implemented,
          analytics_platform: setup.website_data_capture.analytics_platform,
        },
        measurement_partner_count: setup.measurement_partners?.length ?? 0,
        active_measurement_partners: setup.measurement_partners?.filter((p) => p.status === "active").map((p) => p.name) ?? [],
      };
      return { content: [{ type: "text", text: JSON.stringify(overview, null, 2) }] };
    },
  },

  {
    name: "get_tag_management",
    description:
      "Get full tag management system details: platform (GTM, Tealium, etc.), container ID, implementation type, server-side endpoint, and configuration notes.",
    inputSchema: z.object({}),
    handler: async () => {
      const setup = await adapter.getMeasurementSetup();
      return { content: [{ type: "text", text: JSON.stringify(setup.tag_management, null, 2) }] };
    },
  },

  {
    name: "list_pixels_and_tags",
    description:
      "List all platform pixels and tracking tags: implementation type (client/server-side), events tracked, custom parameters. Optionally filter by platform.",
    inputSchema: z.object({
      platform: z
        .enum(["google_ads", "meta", "dv360", "youtube", "linkedin", "tiktok", "twitter_x", "pinterest", "snapchat", "amazon", "other"])
        .optional()
        .describe("Filter to a specific platform's pixels"),
    }),
    handler: async (args: { platform?: string }) => {
      const pixels = await adapter.getPixelTags(
        args.platform as Parameters<typeof adapter.getPixelTags>[0]
      );
      if (pixels.length === 0) {
        return { content: [{ type: "text", text: "No pixels/tags found. Add them to data/measurement.json." }] };
      }
      return {
        content: [{ type: "text", text: JSON.stringify({ count: pixels.length, pixels_and_tags: pixels }, null, 2) }],
      };
    },
  },

  {
    name: "list_conversion_apis",
    description:
      "List all Conversion API implementations (Meta CAPI, Google Enhanced Conversions, TikTok Events API, etc.): events sent, match rate, deduplication method. Filter by platform.",
    inputSchema: z.object({
      platform: z
        .enum(["google_ads", "meta", "dv360", "youtube", "linkedin", "tiktok", "twitter_x", "pinterest", "snapchat", "amazon", "other"])
        .optional()
        .describe("Filter to a specific platform"),
    }),
    handler: async (args: { platform?: string }) => {
      const apis = await adapter.getConversionAPIs(
        args.platform as Parameters<typeof adapter.getConversionAPIs>[0]
      );
      if (apis.length === 0) {
        return { content: [{ type: "text", text: "No Conversion APIs configured. Add them to data/measurement.json." }] };
      }
      return {
        content: [{ type: "text", text: JSON.stringify({ count: apis.length, conversion_apis: apis }, null, 2) }],
      };
    },
  },

  {
    name: "get_cm360_setup",
    description:
      "Get Campaign Manager 360 configuration: account ID, Floodlight configuration ID, and all u-variables (custom dimensions) with their names, types, descriptions, and example values.",
    inputSchema: z.object({}),
    handler: async () => {
      const setup = await adapter.getMeasurementSetup();
      if (!setup.cm360) {
        return { content: [{ type: "text", text: "No CM360 setup configured. Add it to data/measurement.json under the 'cm360' key." }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(setup.cm360, null, 2) }] };
    },
  },

  {
    name: "get_website_data_capture",
    description:
      "Get the website data capture setup: data layer implementation status and variables, analytics platform and property ID, first-party cookie config (domain, duration, captured data).",
    inputSchema: z.object({}),
    handler: async () => {
      const setup = await adapter.getMeasurementSetup();
      return { content: [{ type: "text", text: JSON.stringify(setup.website_data_capture, null, 2) }] };
    },
  },

  {
    name: "list_measurement_partners",
    description:
      "List measurement and analytics partners (MMM, incrementality testing, brand lift, attribution providers). Shows status, platforms covered, cadence, and contacts.",
    inputSchema: z.object({
      type: z
        .enum(["mmm", "incrementality", "brand_lift", "attribution", "analytics", "identity", "other"])
        .optional()
        .describe("Filter by partner type"),
    }),
    handler: async (args: { type?: string }) => {
      const setup = await adapter.getMeasurementSetup();
      let partners = setup.measurement_partners ?? [];
      if (args.type) partners = partners.filter((p) => p.type === args.type);
      if (partners.length === 0) {
        return { content: [{ type: "text", text: "No measurement partners found." }] };
      }
      return {
        content: [{ type: "text", text: JSON.stringify({ count: partners.length, partners }, null, 2) }],
      };
    },
  },
];
