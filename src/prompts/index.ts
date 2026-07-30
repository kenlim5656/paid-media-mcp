/**
 * Copyright 2026 @kenlim5656. All rights reserved.
 * Licensed under the Business Source License 1.1 (BSL 1.1)
 * Persistent Attribution Required. See /LICENSE and /NOTICE for terms.
 * Central Suite Repository: https://github.com/kenlim5656/paid-media-suite
 */
export const prompts = [
  {
    name: "campaign_performance_review",
    description:
      "Generate a structured performance review for a campaign over a given period, including pacing analysis and recommendations.",
    arguments: [
      { name: "campaign_id", description: "Campaign ID to review", required: true },
      { name: "date_from", description: "Start date (YYYY-MM-DD)", required: true },
      { name: "date_to", description: "End date (YYYY-MM-DD)", required: true },
    ],
    handler: (args: Record<string, string>) => `
You are a senior paid media analyst. Perform a thorough performance review for campaign "${args.campaign_id}" from ${args.date_from} to ${args.date_to}.

Steps:
1. Call \`get_campaign\` to understand the campaign's objective, budget, and targeting.
2. Call \`get_campaign_performance\` for the specified date range.
3. Call \`get_benchmarks\` for the campaign's platform and objective.
4. Compare actuals to benchmarks; identify over/under-performance.
5. Check budget pacing: are spend levels aligned with the campaign flight?
6. Provide a structured review with: Summary, Key Metrics, Pacing Analysis, Benchmark Comparison, Top Findings, and Recommendations.
`,
  },

  {
    name: "team_weekly_report",
    description:
      "Generate a weekly performance report for a media team across all their campaigns.",
    arguments: [
      { name: "team_id", description: "Team ID", required: true },
      { name: "week_start", description: "Start of the week (YYYY-MM-DD, Monday)", required: true },
    ],
    handler: (args: Record<string, string>) => {
      const weekEnd = new Date(args.week_start);
      weekEnd.setDate(weekEnd.getDate() + 6);
      const weekEndStr = weekEnd.toISOString().split("T")[0];
      return `
You are a paid media analyst preparing the weekly performance report for team "${args.team_id}" for the week of ${args.week_start} to ${weekEndStr}.

Steps:
1. Call \`get_team\` to understand the team's objectives and KPIs.
2. Call \`get_team_performance\` for the week (${args.week_start} to ${weekEndStr}).
3. Call \`list_campaigns\` filtered by team_id to see all active campaigns.
4. Call \`list_reporting_templates\` filtered by audience "media_team" to find the weekly template.
5. Use the template structure to organize the report.

Report sections: Executive Summary, Campaign Scorecards (one per active campaign), Budget Pacing, Platform Breakdown, Notable Findings, Action Items for Next Week.
`;
    },
  },

  {
    name: "attribution_analysis",
    description:
      "Explain how different attribution models would affect campaign credit allocation and recommend the best model for a given objective.",
    arguments: [
      { name: "campaign_id", description: "Campaign ID to analyze", required: true },
    ],
    handler: (args: Record<string, string>) => `
You are a paid media measurement expert. Analyze attribution options for campaign "${args.campaign_id}".

Steps:
1. Call \`get_campaign\` to understand the campaign objective and funnel stage.
2. Call \`list_attribution_models\` to see all configured attribution setups.
3. For each model relevant to the campaign's platform, explain:
   - How conversion credit would be allocated
   - What bias the model introduces (e.g. last-click over-credits bottom-funnel)
   - When this model is most appropriate
4. Recommend the best attribution model for this campaign's objective and why.
5. Flag any discrepancies between the campaign's current attributed results and what a different model would show.
`,
  },

  {
    name: "budget_pacing_check",
    description:
      "Check whether all active campaigns are on track to deliver their budgets by end of flight.",
    arguments: [
      { name: "team_id", description: "Team ID (leave blank for all teams)", required: false },
      { name: "check_date", description: "Date to check pacing as of (YYYY-MM-DD)", required: true },
    ],
    handler: (args: Record<string, string>) => `
You are a paid media operations manager. Perform a budget pacing check as of ${args.check_date}${args.team_id ? ` for team "${args.team_id}"` : " across all teams"}.

Steps:
1. Call \`list_campaigns\` with status "active"${args.team_id ? ` and team_id "${args.team_id}"` : ""}.
2. For each active campaign, call \`get_campaign_performance\` from the campaign start_date to ${args.check_date}.
3. Calculate: days elapsed / total campaign days = expected pacing %.
4. Compare actual spend % to expected pacing % for each campaign.
5. Flag campaigns that are: >10% over-pacing, >10% under-pacing, or at risk of not delivering.
6. Output a pacing scorecard table and prioritized action list.
`,
  },

  {
    name: "channel_mix_analysis",
    description:
      "Analyze the current channel/platform mix and recommend optimizations based on performance and objectives.",
    arguments: [
      { name: "team_id", description: "Team ID to analyze", required: true },
      { name: "date_from", description: "Analysis start date (YYYY-MM-DD)", required: true },
      { name: "date_to", description: "Analysis end date (YYYY-MM-DD)", required: true },
    ],
    handler: (args: Record<string, string>) => `
You are a paid media strategist. Analyze the channel mix for team "${args.team_id}" from ${args.date_from} to ${args.date_to}.

Steps:
1. Call \`get_team\` to understand the team's objectives and primary KPIs.
2. Call \`list_campaigns\` filtered by team_id to see all campaigns and their platforms.
3. Call \`get_team_performance\` for the date range to get spend and performance by campaign.
4. Group results by platform; calculate spend share, performance metrics, and efficiency by channel.
5. Call \`get_benchmarks\` for each platform to compare against industry norms.
6. Provide: Channel Mix Summary table, Performance by Channel, Efficiency Rankings, Under/Over-invested channels, and Reallocation Recommendations.
`,
  },

  {
    name: "test_and_learn_review",
    description:
      "Review the full test-and-learn history for a team, summarize key learnings, and recommend next tests based on gaps in the testing roadmap.",
    arguments: [
      { name: "team_id", description: "Team ID", required: false },
      { name: "platform", description: "Narrow to a specific platform", required: false },
    ],
    handler: (args: Record<string, string>) => `
You are a paid media testing and optimization specialist. Review the test-and-learn program${args.team_id ? ` for team "${args.team_id}"` : ""}${args.platform ? ` on platform "${args.platform}"` : ""}.

Steps:
1. Call \`get_testing_methodology\` to understand the rules for what constitutes a winner.
2. Call \`get_test_learnings\` to retrieve all completed tests with their outcomes.
3. Call \`list_tests\` with status "active" to see what's currently running.
4. Call \`list_tests\` with status "planned" to see what's queued.
${args.team_id ? `5. Call \`get_team\` to understand the team's objectives and primary KPIs.` : "5. Call `list_teams` for context on team objectives."}

Produce:
- **Key Learnings Summary**: Top 5 actionable learnings from completed tests, with the metric impact
- **Active Tests**: Current test status and when to expect results
- **Testing Gaps**: Which test types (creative, audience, bidding, landing page) are under-tested
- **Recommended Next Tests**: 3 specific test ideas with hypothesis, suggested methodology, and expected impact
`,
  },

  {
    name: "audience_strategy_review",
    description:
      "Review the full audience strategy for a platform: first-party segments available, lookalike setup, third-party layers in use, and recommendations for improving targeting efficiency.",
    arguments: [
      { name: "platform", description: "Platform to review audience strategy for", required: true },
    ],
    handler: (args: Record<string, string>) => `
You are a paid media audience strategist. Review the full audience strategy for platform "${args.platform}".

Steps:
1. Call \`list_first_party_audiences\` filtered by platform "${args.platform}" to see available 1P segments.
2. Call \`get_lookalike_strategy\` to understand the lookalike setup and best-performing expansion sizes.
3. Call \`list_third_party_audience_layers\` filtered by platform "${args.platform}" to see overlay options.
4. Call \`list_data_providers\` with status "active" to identify contracted data available for this platform.
5. Call \`get_onboarding_platforms\` to understand how first-party data is activated.
6. Call \`list_campaigns\` filtered by platform to see current campaigns and their audience targeting.

Produce:
- **Audience Inventory**: What's available vs what's actively being used
- **First-Party Activation**: How well the team is leveraging owned data
- **Lookalike Quality**: Assessment of seed audiences and expansion strategy
- **Third-Party Layer Usage**: Which overlays are in use, which best-performers are not being used
- **Data Provider Opportunities**: Contracted data not being fully utilized
- **Recommendations**: 3-5 specific audience strategy improvements with expected impact
`,
  },

  {
    name: "measurement_audit",
    description:
      "Audit the full measurement and tracking setup: identify gaps, deduplication risks, signal quality issues, and attribution reliability concerns.",
    arguments: [],
    handler: () => `
You are a paid media measurement and tracking specialist. Conduct a comprehensive measurement audit.

Steps:
1. Call \`get_measurement_overview\` for a high-level picture of the tracking stack.
2. Call \`get_tag_management\` for details on the TMS and implementation type.
3. Call \`list_pixels_and_tags\` (no filter) to review all platform pixels.
4. Call \`list_conversion_apis\` (no filter) to review all server-side signals.
5. Call \`get_website_data_capture\` to assess data layer and cookie setup.
6. Call \`list_measurement_partners\` to understand what measurement solutions are in place.
7. Call \`list_attribution_models\` to cross-reference attribution configs with tracking setup.
8. Call \`get_cm360_setup\` for CM360/Floodlight configuration.

Produce:
- **Tracking Coverage**: Which platforms have client-side + server-side signals vs client-side only
- **Signal Quality Assessment**: Match rates, deduplication method, known gaps (e.g. iOS signal loss)
- **Data Layer Completeness**: Are all key variables being captured for downstream use?
- **Attribution Reliability**: Do the attribution models rely on data that is actually being captured?
- **Gaps & Risks**: Specific tracking gaps, deduplication risks, or data quality issues
- **Priority Fixes**: Ranked list of measurement improvements with estimated impact
`,
  },

  {
    name: "asset_readiness_check",
    description:
      "Check whether assets are ready for a campaign launch: verify specs compliance, identify missing sizes or formats, and confirm asset locations.",
    arguments: [
      { name: "campaign_id", description: "Campaign ID to check assets for", required: true },
    ],
    handler: (args: Record<string, string>) => `
You are a paid media trafficking and asset manager. Check asset readiness for campaign "${args.campaign_id}".

Steps:
1. Call \`get_campaign\` to understand the platform, creative themes, and funnel stage.
2. Call \`get_asset_library\` to find the DAM location and access info.
3. Call \`list_asset_categories\` to see what asset types are available.
4. Call \`get_asset_specs\` for the campaign's platform to get required dimensions and formats.
5. Based on the campaign objective and platform, determine which asset sizes/formats are required.

Produce:
- **Required Assets Checklist**: Every size and format needed for the campaign platform
- **DAM Location**: Where to find existing assets and the naming convention to use
- **Spec Compliance Notes**: Common issues for this platform to check (text overlay limits, file sizes, etc.)
- **Missing Assets**: Clearly flag which required sizes/formats are not yet confirmed available
- **Launch Readiness**: Go / No-go recommendation with specific blockers if any
`,
  },

  // ── Action prompts ────────────────────────────────────────────────────────

  {
    name: "create_campaign_brief",
    description:
      "Design a new paid media campaign using your team's historical performance, audience library, attribution setup, and platform knowledge. Produces a structured campaign brief ready for implementation. For GMP platforms, optionally outputs a bulk upload file.",
    arguments: [
      { name: "objective", description: "Campaign objective (e.g. conversions, awareness, lead_generation)", required: true },
      { name: "platform", description: "Target platform (e.g. meta, google_ads, dv360, sa360, linkedin)", required: true },
      { name: "team_id", description: "Team that will manage this campaign", required: true },
      { name: "budget", description: "Total or daily budget with type, e.g. '$50,000 monthly' or '$2,000 daily'", required: true },
      { name: "start_date", description: "Planned start date (YYYY-MM-DD)", required: true },
      { name: "end_date", description: "Planned end date or 'always-on'", required: false },
      { name: "output_format", description: "Output format: 'brief' (default), 'dv360_sdf', 'sa360_bulksheet', or 'cm360_trafficking_sheet'", required: false },
      { name: "additional_context", description: "Any additional context: product launch, seasonal event, target audience, etc.", required: false },
    ],
    handler: (args: Record<string, string>) => {
      const outputFormat = args.output_format ?? "brief";
      const isBulkUpload = ["dv360_sdf", "sa360_bulksheet", "cm360_trafficking_sheet"].includes(outputFormat);
      const bulkPlatformMap: Record<string, string> = {
        dv360_sdf: "dv360",
        sa360_bulksheet: "sa360",
        cm360_trafficking_sheet: "cm360",
      };

      return `
You are a senior paid media strategist and campaign architect. Design a new ${args.objective} campaign on ${args.platform} for team "${args.team_id}".

Campaign parameters:
- Objective: ${args.objective}
- Platform: ${args.platform}
- Budget: ${args.budget}
- Start date: ${args.start_date}
- End date: ${args.end_date ?? "always-on / no end date"}
- Output format: ${outputFormat}
${args.additional_context ? `- Additional context: ${args.additional_context}` : ""}

Research steps:
1. Call \`get_team\` for team_id "${args.team_id}" to understand objectives, KPIs, and existing accounts.
2. Call \`list_campaigns\` filtered by team_id and platform "${args.platform}" with status "active" — understand what's already running to avoid duplication and learn from structure.
3. Call \`get_benchmarks\` for platform "${args.platform}" and objective "${args.objective}" to know what good performance looks like.
4. Call \`list_first_party_audiences\` filtered by platform "${args.platform}" — identify available 1P segments and best lookalike seeds.
5. Call \`get_lookalike_strategy\` and \`list_third_party_audience_layers\` for platform "${args.platform}" — identify default and best-performing audience overlays.
6. Call \`get_test_learnings\` filtered by platform "${args.platform}" — apply past creative, audience, and bidding learnings to this campaign's design.
7. Call \`list_attribution_models\` — recommend the right attribution model for this objective.
8. Call \`get_asset_specs\` for type "image" and platform "${args.platform}", and type "video" if relevant — confirm what creative assets will be needed.
${isBulkUpload ? `9. Call \`get_bulk_upload_schema\` for platform "${bulkPlatformMap[outputFormat]}" for each required entity type.
10. Call \`get_platform_org_defaults\` for platform "${bulkPlatformMap[outputFormat]}" to apply standard naming and field defaults.` : ""}

${outputFormat === "brief" ? `
Produce a structured campaign brief with these sections:

## Campaign Overview
Name, objective, platform, team, budget, flight dates, funnel stage.

## Strategy Rationale
Why this campaign design makes sense given team objectives and historical performance.

## Targeting Plan
- Primary audience(s): which 1P segment or LAL seed, expansion %, suppression lists
- Audience overlays: which third-party layers to apply and why
- Geography, device, and demographic targeting

## Budget & Pacing
Daily/monthly breakdown, pacing strategy, flight structure.

## Bidding Strategy
Recommended bid strategy with rationale (reference benchmarks and past test results).

## Creative Requirements
Required asset sizes and formats for this platform. Creative themes recommended based on past test learnings.

## Attribution
Recommended attribution model and window for this campaign type.

## Success Metrics
Primary KPI, secondary KPIs, target values based on benchmarks and team goals.

## Pre-launch Checklist
Tracking, audience setup, creative, naming convention, QA steps before going live.
` : `
Produce the campaign brief (abbreviated — key specs only) followed immediately by the ready-to-upload bulk file.

## Campaign Brief (Summary)
Name, objective, budget, targeting approach, bid strategy — 5-8 bullet points.

## ${outputFormat.toUpperCase()} Output

Output a properly formatted CSV that can be uploaded directly to ${bulkPlatformMap[outputFormat].toUpperCase()}.

Rules:
- Use the exact column names from the schema (column_name field) — do not invent or abbreviate columns
- Apply org default field values where specified
- Apply the org naming convention
- Required fields must all be populated
- For new entities, leave ID columns blank
- Dates in the platform's required format
- Output each entity type as a separate labeled section (e.g. "--- SDF_Campaign.csv ---") with a header row followed by data rows
- After each CSV block, include a brief validation checklist: required fields confirmed, naming convention followed, common errors checked
`}
`;
    },
  },

  {
    name: "optimize_campaign",
    description:
      "Analyze a campaign's performance and produce a prioritized optimization action list. For GMP campaigns, optionally output bulk upload files with the changes pre-populated.",
    arguments: [
      { name: "campaign_id", description: "Campaign ID to optimize", required: true },
      { name: "date_from", description: "Analysis start date (YYYY-MM-DD)", required: true },
      { name: "date_to", description: "Analysis end date (YYYY-MM-DD)", required: true },
      { name: "output_format", description: "Output format: 'brief' (default), 'dv360_sdf', 'sa360_bulksheet', or 'cm360_trafficking_sheet'", required: false },
    ],
    handler: (args: Record<string, string>) => {
      const outputFormat = args.output_format ?? "brief";
      const isBulkUpload = ["dv360_sdf", "sa360_bulksheet", "cm360_trafficking_sheet"].includes(outputFormat);
      const bulkPlatformMap: Record<string, string> = {
        dv360_sdf: "dv360",
        sa360_bulksheet: "sa360",
        cm360_trafficking_sheet: "cm360",
      };

      return `
You are a senior paid media optimization specialist. Analyze campaign "${args.campaign_id}" from ${args.date_from} to ${args.date_to} and produce a prioritized optimization plan.

Research steps:
1. Call \`get_campaign\` to understand the campaign objective, budget, targeting, bid strategy, and platform.
2. Call \`get_campaign_performance\` for the date range to get daily metrics and aggregated totals.
3. Call \`get_benchmarks\` for this campaign's platform and objective — identify where performance is above/below par.
4. Call \`get_team\` for this campaign's team_id to understand KPI targets.
5. Call \`get_testing_methodology\` and \`get_test_learnings\` filtered by this platform — see if any relevant learnings apply.
6. Call \`list_third_party_audience_layers\` for this platform filtered by is_best_performer: true — check if best-performing overlays are being used.
7. Call \`list_first_party_audiences\` for this platform — identify any 1P segments not currently in use that could improve efficiency.
${isBulkUpload ? `8. Call \`get_bulk_upload_schema\` for platform "${bulkPlatformMap[outputFormat]}" for the entity types that will change (e.g. line_item for bid/budget, campaign for status).
9. Call \`get_platform_org_defaults\` for platform "${bulkPlatformMap[outputFormat]}".` : ""}

${outputFormat === "brief" ? `
Produce a structured optimization report:

## Performance Diagnosis
Current metrics vs targets vs benchmarks. Where is this campaign over/under-performing and why?

## Pacing Assessment
Is spend on pace? Projected end-of-flight spend vs budget. Risk of under/over-delivery.

## Prioritized Action List
Each action must include:
- **Action**: Exactly what to change (e.g. "Increase line item bid from $3.00 to $4.50 CPM")
- **Rationale**: Why, supported by the data
- **Expected Impact**: What metric improves and by approximately how much
- **Priority**: High / Medium / Low
- **Urgency**: Do today / This week / Next review cycle

Categories to cover: bid strategy, budget allocation, audience targeting, frequency, creative rotation, landing page, attribution.

## Tests to Queue
1-2 specific A/B tests to run next based on the diagnosis, with hypothesis and methodology.

## Do Not Change
Anything that is working well and should be left alone.
` : `
## Optimization Summary (Brief)
Top 3 changes being made and the expected impact — 3 bullet points.

## ${outputFormat.toUpperCase()} Output

Output a properly formatted CSV containing only the rows that need to change.

Rules:
- For edits, always include the entity ID column (Campaign Id, Line Item Id, etc.) with the existing ID
- Only include the columns that are changing plus the ID and Name columns — do not output all fields
- Use the exact column names from the schema
- Each CSV block labeled (e.g. "--- SDF_LineItem.csv (edits only) ---")
- After the CSV, include a change log: for each row, one-line explanation of what changed and why
`}
`;
    },
  },

  {
    name: "analyze_performance",
    description:
      "Generate a comprehensive performance analysis across all campaigns for a team or the full portfolio. Cross-references benchmarks, team targets, and historical trends.",
    arguments: [
      { name: "team_id", description: "Team to analyze (leave blank for full portfolio)", required: false },
      { name: "date_from", description: "Analysis start date (YYYY-MM-DD)", required: true },
      { name: "date_to", description: "Analysis end date (YYYY-MM-DD)", required: true },
      { name: "compare_to_prior_period", description: "Include prior period comparison: 'true' or 'false' (default: true)", required: false },
    ],
    handler: (args: Record<string, string>) => {
      const comparePrior = args.compare_to_prior_period !== "false";
      const scope = args.team_id ? `team "${args.team_id}"` : "the full paid media portfolio";

      // Calculate prior period dates
      const from = new Date(args.date_from);
      const to = new Date(args.date_to);
      const periodDays = Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
      const priorTo = new Date(from); priorTo.setDate(priorTo.getDate() - 1);
      const priorFrom = new Date(priorTo); priorFrom.setDate(priorFrom.getDate() - periodDays);
      const priorFromStr = priorFrom.toISOString().split("T")[0];
      const priorToStr = priorTo.toISOString().split("T")[0];

      return `
You are a senior paid media analyst. Produce a comprehensive performance analysis for ${scope} from ${args.date_from} to ${args.date_to}.

Research steps:
1. ${args.team_id ? `Call \`get_team\` for team_id "${args.team_id}" to understand objectives, KPIs, and targets.` : "Call `list_teams` to understand all teams and their objectives."}
2. ${args.team_id ? `Call \`get_team_performance\` for team_id "${args.team_id}"` : "Call `get_team_performance` for each team"} with date range ${args.date_from} to ${args.date_to}.
3. Call \`list_campaigns\` filtered by ${args.team_id ? `team_id "${args.team_id}"` : "all active campaigns"} to understand the campaign mix.
${comparePrior ? `4. Call \`get_team_performance\` for the prior period ${priorFromStr} to ${priorToStr} for period-over-period comparison.` : ""}
${comparePrior ? "5." : "4."} Call \`get_benchmarks\` for each relevant platform/objective combination to compare against industry norms.
${comparePrior ? "6." : "5."} Call \`get_testing_methodology\` and check for any active tests that may be affecting performance metrics.

Produce a full performance analysis:

## Executive Summary
3-5 bullet points: what happened, headline numbers, key wins, key concerns.

## KPI Scorecard
Table: each campaign | primary KPI target | actual | vs target | vs benchmark${comparePrior ? " | vs prior period" : ""}. RAG status for each.

## Channel Performance Breakdown
Spend, primary KPI, efficiency metric (ROAS/CPA/CPM), and % of total spend by platform. Identify best and worst performing channels.

## Trend Analysis
${comparePrior ? `Period-over-period changes for key metrics. What improved, what declined, what is the likely cause?` : "Key metric trends across the period. Any notable spikes, drops, or patterns?"}

## Pacing & Budget Efficiency
Was budget delivered efficiently? Any overspend or underspend by campaign?

## Top Performers
Top 3 campaigns by primary KPI efficiency. What contributed to their performance?

## Underperformers
Bottom 3 campaigns. Diagnosis and recommended action for each.

## Recommended Actions
Prioritized list of changes to make in the next period based on the analysis.
`;
    },
  },

  {
    name: "create_report",
    description:
      "Generate a formatted performance report for a specific audience (executive, media team, client, internal) using your configured reporting templates.",
    arguments: [
      { name: "audience", description: "Report audience: executive, media_team, client, or internal", required: true },
      { name: "scope", description: "What to report on: 'all', a team_id, or a campaign_id", required: true },
      { name: "date_from", description: "Report start date (YYYY-MM-DD)", required: true },
      { name: "date_to", description: "Report end date (YYYY-MM-DD)", required: true },
      { name: "template_id", description: "Specific reporting template ID to use (leave blank to auto-select by audience)", required: false },
    ],
    handler: (args: Record<string, string>) => `
You are a paid media analyst generating a ${args.audience} report for ${args.scope === "all" ? "the full paid media program" : `"${args.scope}"`} covering ${args.date_from} to ${args.date_to}.

Research steps:
1. Call \`list_reporting_templates\` filtered by audience "${args.audience}" to find the right template${args.template_id ? ` (or use template "${args.template_id}" directly via \`get_reporting_template\`)` : ""}.
2. ${args.scope === "all" ? "Call `list_teams` and for each team call `get_team_performance`" : args.scope.startsWith("team_") ? `Call \`get_team\` for "${args.scope}" and \`get_team_performance\`` : `Call \`get_campaign\` and \`get_campaign_performance\` for "${args.scope}"`} with date range ${args.date_from} to ${args.date_to}.
3. Call \`get_benchmarks\` for each relevant platform/objective.
4. If the template includes budget/pacing sections: call \`list_campaigns\` with status "active" to check pacing.
5. For executive reports: check if there are any active tests via \`list_tests\` with status "active" to flag.

Report writing rules for a **${args.audience}** audience:
${args.audience === "executive" ? `
- No platform jargon — use plain English. "Cost per purchase" not "CPA".
- Lead with business impact ($revenue, leads, brand reach) before efficiency metrics.
- Highlight 2-3 decisions that were made and their outcome.
- Keep to 1 page of key metrics + brief narrative. Full data in appendix.
- Flag anything that needs a decision or approval from leadership.` : ""}
${args.audience === "media_team" ? `
- Full metric depth — include all KPIs, platform-level breakdowns, creative performance.
- Pacing status for every active campaign (on-track / at risk / needs action).
- Specific action items with owner and due date.
- Include active tests and when results are expected.` : ""}
${args.audience === "client" ? `
- Focus on their business goals, not media metrics. Lead with outcomes.
- Avoid internal platform names and jargon.
- Benchmark comparisons to show relative performance.
- One clear recommendation and rationale.
- Professional formatting — assume this will be presented or forwarded.` : ""}
${args.audience === "internal" ? `
- Full technical detail — attribution notes, tracking anomalies, platform-specific nuances.
- Document any data quality issues or caveats.
- Include methodology notes for metrics that may be interpreted differently.` : ""}

Follow the template sections exactly as the report structure. Produce the complete report ready to share.
`,
  },

  {
    name: "generate_attribution_report",
    description:
      "Generate a cross-channel attribution analysis comparing how different attribution models distribute credit across platforms and campaigns, and recommend the optimal model for each use case.",
    arguments: [
      { name: "team_id", description: "Team to analyze (or leave blank for full portfolio)", required: false },
      { name: "date_from", description: "Analysis start date (YYYY-MM-DD)", required: true },
      { name: "date_to", description: "Analysis end date (YYYY-MM-DD)", required: true },
    ],
    handler: (args: Record<string, string>) => `
You are a paid media measurement specialist. Generate a cross-channel attribution analysis for ${args.team_id ? `team "${args.team_id}"` : "the full portfolio"} from ${args.date_from} to ${args.date_to}.

Research steps:
1. Call \`list_attribution_models\` to get all configured attribution setups.
2. ${args.team_id ? `Call \`get_team\` for "${args.team_id}" and \`list_campaigns\` filtered by team_id` : "Call `list_campaigns` with status active"} to understand the campaign mix.
3. Call \`get_team_performance\` (or \`get_campaign_performance\` per campaign) for the date range.
4. Call \`get_measurement_overview\` and \`list_conversion_apis\` to understand signal quality and deduplication setup.
5. Call \`list_measurement_partners\` to check if incrementality or MMM data is available.

Produce a full attribution analysis:

## Attribution Configurations in Use
Table of all configured models: name, model type, click window, view window, platforms applied, conversion events.

## Why Attribution Matters Here
Given the channel mix (upper/lower funnel split, cross-channel journey length), explain why attribution model choice materially affects credit distribution.

## Model Comparison Analysis
For each model in use:
- How does it allocate credit across channels for this campaign mix?
- Which channels are over-credited vs under-credited vs a linear/data-driven model?
- What decisions might you make incorrectly if you optimized to this model alone?

## Signal Quality Assessment
Based on the measurement setup:
- Where is attribution data reliable (server-side + client-side redundancy)?
- Where is signal degraded (iOS, cookie restrictions, view-through assumptions)?
- Any known discrepancies between platform-reported and GA4 numbers?

## Incrementality Context
If incrementality data is available from measurement partners: how does incremental contribution compare to attributed contribution per channel?

## Recommendations
1. Which attribution model should be used for bid optimization, per campaign type?
2. Which model should be used for budget allocation decisions?
3. Which model should be used for executive/board reporting?
4. Any measurement gaps to close that would improve attribution reliability?
`,
  },

  {
    name: "generate_bulk_upload",
    description:
      "Generate a ready-to-upload bulk file for DV360 (SDF), SA360 (Bulksheet), or CM360 (Trafficking Sheet) based on a campaign brief or optimization action list.",
    arguments: [
      { name: "platform", description: "Target platform: dv360, sa360, or cm360", required: true },
      { name: "action", description: "What the file should do: 'create_campaign', 'edit_bids', 'edit_budgets', 'pause_campaigns', 'create_placements', 'create_ads', or describe custom", required: true },
      { name: "campaign_id", description: "Existing campaign ID to base edits on (for edit/optimization files)", required: false },
      { name: "brief_context", description: "Free-text campaign brief or optimization instructions to use as input", required: false },
    ],
    handler: (args: Record<string, string>) => `
You are a paid media trafficking specialist. Generate a ${args.platform.toUpperCase()} bulk upload file to: ${args.action}.
${args.campaign_id ? `Base this on existing campaign: ${args.campaign_id}.` : ""}
${args.brief_context ? `Brief/context: ${args.brief_context}` : ""}

Research steps:
1. Call \`get_bulk_upload_instructions\` for platform "${args.platform}" to confirm the upload format and process.
2. Determine which entity types are needed for this action and call \`get_bulk_upload_schema\` for each.
3. Call \`get_platform_org_defaults\` for platform "${args.platform}" to apply standard naming and default field values.
${args.campaign_id ? `4. Call \`get_campaign\` for "${args.campaign_id}" to get existing campaign details as the basis for edits.` : "4. Call `list_campaigns` to understand existing campaign structure if relevant."}
5. Call \`list_first_party_audiences\` and \`list_third_party_audience_layers\` for platform "${args.platform}" if the file involves audience targeting.

Output rules:
- Use the exact column names from the schema — do not abbreviate, rename, or reorder
- Apply all org default values
- Apply the org naming convention for any new entity names
- For edits: include entity ID column with existing IDs; include only columns that are changing plus ID and Name
- For creates: leave ID columns blank; populate all required fields
- Format dates exactly as specified in the schema notes
- Output each entity type as a clearly labeled section:
  \`\`\`csv
  --- [FILENAME] ---
  [header row]
  [data rows]
  \`\`\`
- After all CSV output, include:
  **Pre-upload Checklist:**
  - [ ] All required fields populated
  - [ ] Naming convention followed
  - [ ] Entity IDs correct (for edits)
  - [ ] Dates in correct format
  - [ ] File(s) ready to ZIP/upload
  - Platform-specific checks for ${args.platform}

  **Upload Instructions:**
  (Summary of how to upload this file in the ${args.platform.toUpperCase()} UI)
`,
  },

  // ── Agent workflow prompts ────────────────────────────────────────────────

  {
    name: "diagnose_tracking_drop",
    description:
      "Watchdog workflow: diagnose a suspected tracking degradation across the full pipeline. " +
      "Checks signal capture rates, CRM null fields, and active alerts, then produces " +
      "a structured anomaly report identifying the break point and likely cause.",
    arguments: [
      {
        name: "suspected_platform",
        description: "Platform where the drop was noticed, e.g. 'meta', 'google_ads'. Leave blank for full audit.",
        required: false,
      },
      {
        name: "since_hours",
        description: "How many hours back to investigate (default: 24)",
        required: false,
      },
    ],
    handler: (args: Record<string, string>) => {
      const platform = args.suspected_platform ? `Focus especially on platform: ${args.suspected_platform}.` : "Audit all platforms.";
      const hours = args.since_hours || "24";
      return `You are the Watchdog Agent — a data governance specialist for a paid media attribution system.

A tracking degradation has been reported or suspected. Your job is to diagnose it systematically and produce a clear anomaly report for the engineering and media teams.

${platform}

## Investigation Steps

1. **Signal Capture Rates** — Call \`check_signal_capture_health\` (hours_back: ${hours}).
   - Note which namespaces are below threshold.
   - Check if the drop is isolated to one platform or affects multiple.
   - Is there a pattern suggesting a specific browser/OS (e.g. Safari ITP blocking first-party cookies)?

2. **CRM Null Fields** — Call \`detect_crm_null_fields\` (since_hours: ${hours}).
   - Is the null rate spiking? When did it start?
   - Cross-reference with the signal capture drop: do they match in timing?

3. **Active Alerts** — Call \`get_watchdog_alerts\` (status: "open").
   - List all open alerts with severity.
   - Have any been open for longer than expected without resolution?

4. **Identity Graph Impact** — Call \`get_attribution_run_history\` (limit: 3).
   - Did the identity match rate drop in recent attribution runs?
   - Is this affecting attribution model accuracy?

## Anomaly Report Format

Produce a structured report with these sections:

**Status**: RED / YELLOW / GREEN

**Break Point Identified**: Which specific signal namespace is failing, on which platform, since approximately when.

**Root Cause Hypothesis**:
- Browser policy change (ITP, third-party cookie deprecation)?
- Tag deployment issue (GTM container published incorrectly)?
- Platform API / pixel outage?
- Server-side GTM configuration error?
- CRM field mapping changed?

**Affected Attribution Data**:
- What % of conversions are now arriving unattributed?
- Which channels/campaigns are most impacted?
- Is current attribution data reliable enough for optimization decisions?

**Engineering Action Items**: Specific, ordered steps to diagnose and fix.

**Marketing Action Items**: What to pause, hold, or caveat until the fix is verified.

Be precise. Name the exact namespace_id and platform. Avoid vague language.`;
    },
  },

  {
    name: "optimize_high_value_pathways",
    description:
      "Analyst workflow: identify campaigns that are driving outsized pipeline contribution " +
      "but are being underfunded, and recommend precise budget reallocations grounded in " +
      "multi-touch attribution data.",
    arguments: [
      {
        name: "conversion_type",
        description: "Which pipeline milestone to optimize for, e.g. 'opportunity_created'. Default: opportunity_created",
        required: false,
      },
      {
        name: "period_days",
        description: "Attribution period to analyze in days (default: 30)",
        required: false,
      },
    ],
    handler: (args: Record<string, string>) => {
      const convType = args.conversion_type || "opportunity_created";
      const days = parseInt(args.period_days || "30");
      const today = new Date().toISOString().split("T")[0];
      const startDate = new Date(Date.now() - days * 86400000).toISOString().split("T")[0];
      return `You are the Analyst Agent — a B2B paid media attribution specialist.

Your goal is to identify high-value touchpoint pathways that are contributing disproportionately
to pipeline and recommend precise budget reallocations to fund them better.

## Context
- Optimization target: **${convType}**
- Analysis period: **${startDate} to ${today}** (${days} days)
- Read the resource \`paid-media://config/attribution-milestones\` for pipeline stage definitions.
- Read the resource \`paid-media://schema/attribution\` for table schemas before writing any SQL.

## Step 1 — Check Data Quality
Call \`get_watchdog_alerts\` (status: "open").
If any CRITICAL alerts exist, note them prominently — attribution results may be unreliable.

## Step 2 — Attribution Results
Call \`get_attribution_results\` (conversion_type: "${convType}").
Identify:
- Top 3 channels by attributed_conversions
- Bottom 3 channels by attributed_conversions with >$0 spend
- Channels with high credit_share_pct but low attributed_cpa (most efficient)
- Channels with low credit_share_pct but high spend (over-funded)

## Step 3 — Latest Model Run
Call \`get_attribution_run_history\` (limit: 1).
Note: model used, identity_match_rate, avg_path_length.
If match rate < 60%, caveat all findings — stitching is incomplete.

## Step 4 — Account Journey Spot-Check (if BigQuery available)
If there is a specific account domain you want to investigate, call \`query_account_journey\`.
This shows the actual multi-platform, cross-device path that led to pipeline — invaluable for stakeholder storytelling.

## Step 5 — Budget Efficiency Analysis
For each channel in the attribution results:
- Calculate: credit_share_pct vs. estimated_budget_share (use total_spend / sum of all spend)
- Flag: channels where credit_share_pct > budget_share_pct by more than 10 points (underfunded)
- Flag: channels where budget_share_pct > credit_share_pct by more than 10 points (overfunded)

## Step 6 — Reallocation Recommendations
For each recommended reallocation:
1. State the source campaign (overfunded) and target campaign (underfunded)
2. Recommend a specific dollar amount to move (respect the max_budget_shift_pct guardrail)
3. Show the math: expected improvement in attributed CPA if credit shares realign
4. Assign a confidence level (High / Medium / Low) based on data volume and identity match rate

If you want to execute a reallocation, call \`reallocate_media_budget\` — it will log the action
and route it for approval before executing.

## Output Format
- **Data Quality Status**: (from alerts)
- **Attribution Model**: (name, period, match rate)
- **Top Performing Channels**: (table with attributed conversions, CPA, ROAS)
- **Underfunded Channels**: (credit share vs. budget share gap)
- **Reallocation Recommendations**: (ranked, with dollar amounts and rationale)
- **Confidence Assessment**: (overall reliability of these findings)`;
    },
  },
];
