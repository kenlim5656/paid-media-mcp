/**
 * Copyright 2026 @kenlim5656. All rights reserved.
 * Licensed under the Business Source License 1.1 (BSL 1.1)
 * Persistent Attribution Required. See /LICENSE and /NOTICE for terms.
 * Central Suite Repository: https://github.com/kenlim5656/paid-media-suite
 */
/**
 * Analytics & Data Governance tools
 *
 * These tools let practitioners query the live data layer interactively —
 * the same data the autonomous agents monitor on a schedule, but on-demand.
 *
 * Tools:
 *   query_account_journey       — full multi-touch path for a specific account domain
 *   check_signal_capture_health — current capture rates for all monitored namespaces
 *   detect_crm_null_fields      — CRM records missing media identifiers
 */

import { z } from "zod";
import type { PaidMediaAdapter } from "../adapters/base.js";

export const analyticsTools = (adapter: PaidMediaAdapter) => [

  // ── Account Journey ─────────────────────────────────────────────────────────

  {
    name: "query_account_journey",
    description:
      "Query the BigQuery data warehouse to return the full multi-touch attribution path " +
      "for all users mapped to a specific company account domain. " +
      "Shows every paid media touchpoint (across all platforms) that influenced the account, " +
      "in chronological order, with attribution credit weights. " +
      "Essential for B2B account-based attribution — surfaces cross-platform, cross-device " +
      "journeys that platform-level reporting misses. " +
      "Requires BigQuery mode (BIGQUERY_PROJECT_ID env var must be set).",
    inputSchema: z.object({
      account_domain: z
        .string()
        .describe(
          "The corporate domain of the target account, e.g. 'cloudflare.com'. " +
          "Do not include www. or https://."
        ),
      lookback_days: z
        .number()
        .optional()
        .describe(
          "Days of history to include. Default 90 — B2B sales cycles are long. " +
          "Use 180+ for enterprise deals."
        ),
      conversion_type: z
        .string()
        .optional()
        .describe(
          "Filter to touchpoints that led to a specific conversion type, " +
          "e.g. 'opportunity_created'. Omit to see all touchpoints."
        ),
    }),
    handler: async (args: {
      account_domain: string;
      lookback_days?: number;
      conversion_type?: string;
    }) => {
      const results = await adapter.queryAccountJourney(
        args.account_domain,
        args.lookback_days ?? 90,
        args.conversion_type
      );

      if (!results || results.touchpoints.length === 0) {
        return {
          content: [{
            type: "text",
            text: `No touchpoints found for domain: ${args.account_domain} in the past ${args.lookback_days ?? 90} days. ` +
              "This may mean: (1) the account hasn't interacted with paid media in this window, " +
              "(2) the domain isn't yet stitched in the identity graph, or " +
              "(3) BigQuery mode isn't configured (BIGQUERY_PROJECT_ID not set).",
          }],
        };
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify(results, null, 2),
        }],
      };
    },
  },

  // ── Signal Capture Health ───────────────────────────────────────────────────

  {
    name: "check_signal_capture_health",
    description:
      "Check the current capture rates for all monitored identity signal namespaces " +
      "(platform click IDs and analytics cookies) against their thresholds. " +
      "Reads from watchdog_capture_rate_log for historical rates and watchdog_alerts for active issues. " +
      "Use this when diagnosing a suspected tracking problem, before running attribution analysis, " +
      "or when a stakeholder questions the data quality. " +
      "Unlike get_watchdog_alerts (which shows cached alert records), this tool can " +
      "also surface the trend direction for each signal.",
    inputSchema: z.object({
      hours_back: z
        .number()
        .optional()
        .describe("Hours of capture rate history to summarize (default 24)"),
      platform: z
        .string()
        .optional()
        .describe("Filter to a specific platform, e.g. 'meta', 'google_ads'"),
    }),
    handler: async (args: { hours_back?: number; platform?: string }) => {
      const [alerts, captureRates] = await Promise.all([
        adapter.getWatchdogAlerts("open"),
        adapter.getSignalCaptureRates(args.hours_back ?? 24, args.platform),
      ]);

      const criticalAlerts = alerts.filter((a) => a.severity === "critical");
      const warningAlerts  = alerts.filter((a) => a.severity === "warning");

      const overallStatus =
        criticalAlerts.length > 0 ? "RED" :
        warningAlerts.length > 0  ? "YELLOW" : "GREEN";

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            overall_status: overallStatus,
            active_alerts: {
              critical: criticalAlerts.length,
              warning:  warningAlerts.length,
              alerts:   alerts.slice(0, 10),
            },
            capture_rates: captureRates,
          }, null, 2),
        }],
      };
    },
  },

  // ── CRM Null Field Detection ────────────────────────────────────────────────

  {
    name: "detect_crm_null_fields",
    description:
      "Scan recent CRM lead records for missing media identifier fields — " +
      "a key signal that the tracking pipeline has broken. " +
      "Returns the count and percentage of leads created in the past N hours that " +
      "are missing gclid, fbclid, li_fat_id, ga4_client_id, and/or utm_source. " +
      "A spike in null fields means conversions are arriving unattributed, " +
      "which degrades attribution model accuracy. " +
      "Cross-reference with check_signal_capture_health to identify the break point.",
    inputSchema: z.object({
      since_hours: z
        .number()
        .optional()
        .describe("How many hours back to scan (default 24)"),
    }),
    handler: async (args: { since_hours?: number }) => {
      const result = await adapter.getCrmNullFieldStats(args.since_hours ?? 24);

      if (!result) {
        return {
          content: [{
            type: "text",
            text: "CRM null field data not available. Requires either a populated crm_leads_staging " +
              "BigQuery table or a connected Salesforce instance.",
          }],
        };
      }

      const status = result.breach ? "⚠️ BREACH" : "✅ OK";
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            status,
            ...result,
            interpretation: result.breach
              ? `${result.null_pct}% of leads are missing media identifiers — above the ${result.threshold_pct}% threshold. ` +
                "This indicates a tracking break. Use check_signal_capture_health to identify which signal dropped."
              : `${result.null_pct}% null rate is within the ${result.threshold_pct}% threshold.`,
          }, null, 2),
        }],
      };
    },
  },

];
