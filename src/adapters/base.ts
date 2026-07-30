/**
 * Copyright 2026 @kenlim5656. All rights reserved.
 * Licensed under the Business Source License 1.1 (BSL 1.1)
 * Persistent Attribution Required. See /LICENSE and /NOTICE for terms.
 * Central Suite Repository: https://github.com/kenlim5656/paid-media-suite
 */
import type {
  Account,
  Campaign,
  CampaignStatus,
  CampaignObjective,
  Platform,
  Team,
  TeamMember,
  PerformanceRecord,
  AttributionConfiguration,
  AttributionChannelSummary,
  AttributionRun,
  ReportingTemplate,
  AssetLibrary,
  AssetCategory,
  AssetType,
  TestingProgram,
  Test,
  TestStatus,
  TestType,
  AudienceLibrary,
  FirstPartyAudience,
  DataProvider,
  ThirdPartyAudienceLayer,
  MeasurementSetup,
  PixelTag,
  ConversionAPI,
  PlatformsConfig,
  IdentityNamespace,
  WatchdogAlert,
  AnalystInsight,
  OperatorPendingApproval,
} from "../types.js";

export interface CampaignFilters {
  team_id?: string;
  account_id?: string;
  platform?: Platform;
  status?: CampaignStatus;
  objective?: CampaignObjective;
  funnel_stage?: "upper" | "mid" | "lower";
  tag?: string;
  start_date_after?: string;
  end_date_before?: string;
}

export interface PerformanceFilters {
  campaign_id?: string;
  team_id?: string;
  platform?: Platform;
  date_from?: string;
  date_to?: string;
}

/**
 * Implement this interface to connect the MCP server to any data source.
 * The included FileAdapter reads from local JSON files.
 * For live data, implement a GoogleAdsAdapter, MetaAdapter, etc.
 */
export interface PaidMediaAdapter {
  // Meta
  getMetadata(): Promise<{
    company_name: string;
    industry?: string;
    primary_currency: string;
    fiscal_year_start: string;
    last_updated: string;
  }>;

  // Accounts
  getAccounts(team_id?: string): Promise<Account[]>;
  getAccount(id: string): Promise<Account | null>;

  // Teams
  getTeams(): Promise<Team[]>;
  getTeam(id: string): Promise<Team | null>;
  getTeamByAccount(account_id: string): Promise<Team | null>;

  // Team members
  getTeamMembers(team_id?: string): Promise<TeamMember[]>;
  getTeamMember(id: string): Promise<TeamMember | null>;

  // Campaigns
  getCampaigns(filters?: CampaignFilters): Promise<Campaign[]>;
  getCampaign(id: string): Promise<Campaign | null>;

  // Performance
  getPerformance(filters?: PerformanceFilters): Promise<PerformanceRecord[]>;
  getBenchmarks(
    platform?: Platform,
    objective?: CampaignObjective
  ): Promise<{
    avg_ctr?: number;
    avg_cpc?: number;
    avg_cpm?: number;
    avg_cpa?: number;
    avg_roas?: number;
  } | null>;

  // Attribution
  getAttributionConfigurations(): Promise<AttributionConfiguration[]>;
  getAttributionConfiguration(id: string): Promise<AttributionConfiguration | null>;

  // Reporting
  getReportingTemplates(audience?: string): Promise<ReportingTemplate[]>;
  getReportingTemplate(id: string): Promise<ReportingTemplate | null>;

  // Assets
  getAssetLibrary(): Promise<AssetLibrary>;
  getAssetCategories(type?: AssetType): Promise<AssetCategory[]>;
  getAssetCategory(id: string): Promise<AssetCategory | null>;

  // Testing
  getTestingProgram(): Promise<TestingProgram>;
  getTests(filters?: { status?: TestStatus; type?: TestType; team_id?: string; platform?: Platform }): Promise<Test[]>;
  getTest(id: string): Promise<Test | null>;

  // Audiences
  getAudienceLibrary(): Promise<AudienceLibrary>;
  getFirstPartyAudiences(filters?: { business_unit?: string; platform?: Platform }): Promise<FirstPartyAudience[]>;
  getDataProviders(status?: string): Promise<DataProvider[]>;
  getThirdPartyLayers(filters?: { platform?: Platform; is_default?: boolean; is_best_performer?: boolean }): Promise<ThirdPartyAudienceLayer[]>;

  // Measurement
  getMeasurementSetup(): Promise<MeasurementSetup>;
  getPixelTags(platform?: Platform): Promise<PixelTag[]>;
  getConversionAPIs(platform?: Platform): Promise<ConversionAPI[]>;

  // GMP Platforms / Bulk Upload
  getPlatformsConfig(): Promise<PlatformsConfig>;

  // ── Identity ──────────────────────────────────────────────────────────────

  /** All registered identity namespaces from the shared schema registry. */
  getIdentityNamespaces(category?: string): Promise<IdentityNamespace[]>;

  /** A specific namespace definition by ID. */
  getIdentityNamespace(namespace_id: string): Promise<IdentityNamespace | null>;

  // ── Attribution Results (written by Analyst agent) ─────────────────────────

  /** Latest attribution channel summary from the most recent Analyst run. */
  getLatestAttributionResults(conversion_type?: string): Promise<AttributionChannelSummary | null>;

  /** History of attribution model runs. */
  getAttributionRuns(limit?: number): Promise<AttributionRun[]>;

  // ── Agent Outputs ──────────────────────────────────────────────────────────

  /** Active data quality alerts from the Watchdog agent. */
  getWatchdogAlerts(status?: "open" | "acknowledged" | "resolved" | "suppressed"): Promise<WatchdogAlert[]>;

  /** Insights and recommendations from the Analyst agent. */
  getAnalystInsights(filters?: { priority?: "high" | "medium" | "low"; status?: string; limit?: number }): Promise<AnalystInsight[]>;

  /** Media actions proposed by the Operator agent awaiting human approval. */
  getOperatorPendingApprovals(): Promise<OperatorPendingApproval[]>;

  /**
   * Trigger a run of a specific autonomous agent.
   * Requires PAID_MEDIA_AGENT_URL env var to be set.
   * Returns the job ID or a "pending approval" message.
   */
  triggerAgentRun(agent: "watchdog" | "analyst" | "operator", reason: string): Promise<{ triggered: boolean; job_id?: string; message: string }>;

  // ── Analytics & Data Governance ───────────────────────────────────────────

  /**
   * Return the full multi-touch path for all sessions mapped to an account domain.
   * Requires BigQuery mode.
   */
  queryAccountJourney(
    account_domain: string,
    lookback_days: number,
    conversion_type?: string
  ): Promise<{
    account_domain: string;
    entity_count: number;
    touchpoints: object[];
    conversions: object[];
    path_summary: object;
  } | null>;

  /**
   * Return capture rate time series for all monitored namespaces.
   * Reads from watchdog_capture_rate_log.
   */
  getSignalCaptureRates(
    hours_back: number,
    platform?: string
  ): Promise<object[]>;

  /**
   * Return CRM null-field statistics for recent lead records.
   */
  getCrmNullFieldStats(since_hours: number): Promise<{
    source: string;
    hours_sampled: number;
    total_leads: number;
    null_media_ids: number;
    null_pct: number;
    threshold_pct: number;
    breach: boolean;
  } | null>;

  // ── Interactive Media Actions ─────────────────────────────────────────────

  /**
   * Log and optionally execute an audience suppression on a platform.
   * Routes to the Operator agent if PAID_MEDIA_AGENT_URL is set.
   */
  pushAudienceSuppression(
    platform: string,
    advertiser_id: string,
    audience_list_id: string,
    domains: string[],
    rationale: string
  ): Promise<object>;

  /**
   * Log and optionally execute a budget reallocation between campaigns.
   * Routes to the Operator agent if PAID_MEDIA_AGENT_URL is set.
   */
  reallocateMediaBudget(
    platform: string,
    advertiser_id: string,
    source_campaign_id: string,
    target_campaign_id: string,
    amount_usd: number,
    rationale: string
  ): Promise<object>;

  // ── Reporting Views (06_reporting.sql) ───────────────────────────────────
  // These query the pre-built BigQuery views that auto-reference the latest
  // completed attribution run. All require BigQuery mode.
  // FileAdapter stubs return [] / null with a clear error message.

  /**
   * Campaign performance: total spend + MTA attribution side by side.
   * Sources: v_campaign_performance — joins platform_daily_spend + attribution_channel_summary.
   * Returns: platform_roas, attributed_roas, margin_roi, attributed_cpa, pipeline_value per campaign.
   */
  getCampaignPerformanceReport(filters?: {
    platform?: string;
    team_id?: string;
    funnel_stage?: string;
    status?: string;
    date_from?: string;
    date_to?: string;
  }): Promise<object[]>;

  /**
   * Budget pacing: expected vs actual spend, projected total, and pacing status label.
   * Sources: v_pacing_status — computes required_daily_spend and projected_total_spend.
   * Pacing status values: "overpacing" (>110%) | "underpacing" (<90%) | "on_pace" | "no_budget_data".
   */
  getPacingReport(filters?: {
    platform?: string;
    team_id?: string;
    pacing_status?: "overpacing" | "underpacing" | "on_pace" | "no_budget_data";
    funnel_stage?: string;
  }): Promise<object[]>;

  /**
   * ROAS comparison: platform-reported vs MTA attributed vs margin ROI per channel.
   * Sources: v_roas_comparison — highlights platform over-counting (platform_overcount_pct).
   * Use to quantify the gap between what platforms claim and what attribution shows.
   */
  getRoasComparison(filters?: {
    platform?: string;
    channel?: string;
    conversion_type?: string;
  }): Promise<object[]>;

  /**
   * Cross-channel efficiency: attributed CPA, ROAS, pipeline share, and spend vs pipeline gap.
   * Sources: v_channel_efficiency — uses window functions to compute share_pct across channels.
   * Use for budget allocation decisions: which channels punch above their spend weight?
   */
  getChannelEfficiency(): Promise<object[]>;

  /**
   * Ad/creative performance with attribution credit at the creative level.
   * Sources: v_ad_performance — joins platform_daily_spend_ad + attribution_results by ad_id.
   * Returns thumbstop_rate, frequency, attributed_cpa, attributed_roas per creative.
   */
  getAdPerformance(filters?: {
    campaign_id?: string;
    platform?: string;
    creative_format?: string;
    min_spend?: number;
  }): Promise<object[]>;

  /**
   * Keyword performance: spend, quality scores, and impression share metrics.
   * Sources: v_keyword_performance — includes IS_lost_budget, avg_search_impression_share.
   * Excludes negative keywords. Use low_quality_score filter to surface optimization opportunities.
   */
  getKeywordPerformance(filters?: {
    campaign_id?: string;
    platform?: string;
    min_spend?: number;
    low_quality_score?: boolean;
    lost_is_budget?: boolean;
  }): Promise<object[]>;

  /**
   * Daily performance time series with optional week/month aggregation.
   * Sources: v_daily_performance — includes day_of_week, week_start, month_start for grouping.
   * Use group_by to aggregate into weekly or monthly buckets for trend analysis.
   */
  getDailyPerformance(filters?: {
    campaign_id?: string;
    platform?: string;
    team_id?: string;
    date_from?: string;
    date_to?: string;
    group_by?: "day" | "week" | "month";
  }): Promise<object[]>;

  // ── Account-Based Analytics (07_account_analytics.sql) ───────────────────
  // B2B dark funnel visibility — de-anonymized company sessions, engagement
  // scoring, and target account tracking. All require BigQuery mode.

  /**
   * Enriched firmographic profile for a company domain.
   * Sources: company_profiles — industry, size, technologies, account_tier, icp_score, CRM stage.
   * Returns null if the domain has never been resolved or is not in the database.
   */
  getCompanyProfile(company_domain: string): Promise<object | null>;

  /**
   * Target account funnel ranked by composite priority score.
   * Sources: v_target_account_funnel — pipeline stage + intent + recency + page visits + paid exposure.
   * Use intent_spiking filter to surface accounts with sudden engagement increases.
   */
  getTargetAccountFunnel(filters?: {
    account_tier?: "tier_1" | "tier_2" | "tier_3";
    crm_pipeline_stage?: string;
    intent_spiking?: boolean;
    is_suppressed_tofu?: boolean;
    min_sessions_30d?: number;
    limit?: number;
  }): Promise<object[]>;

  /**
   * De-anonymized web sessions for a specific company over a lookback window.
   * Sources: company_sessions — channel, UTM, page flags, paid touchpoint attribution.
   * Note: no raw IP is stored; sessions are resolved via ip_resolution_cache.
   */
  getCompanySessions(company_domain: string, lookback_days?: number): Promise<object[]>;

  /**
   * Rolling engagement summary for a company: intent score, recency, depth, content.
   * Sources: company_engagement — pre-aggregated by period_type (rolling_30d default).
   * Intent score = recency (50%) + depth (30%) + content (20%).
   */
  getCompanyEngagement(company_domain: string, period_type?: string): Promise<object | null>;

  /**
   * Dark funnel coverage: classify target accounts as dark/lapsed/visible.
   * Sources: v_dark_funnel_coverage — "dark" = never seen, "lapsed" = >90d ago, "visible" = recent.
   * Use to identify which in-pipeline accounts have zero web presence to trigger outbound.
   */
  getDarkFunnelCoverage(filters?: {
    account_tier?: "tier_1" | "tier_2" | "tier_3";
    web_presence_status?: "dark" | "lapsed" | "visible";
    crm_pipeline_stage?: string;
  }): Promise<object[]>;

  /**
   * Daily target account activity snapshot history for a company.
   * Sources: target_account_activity — web sessions (today/7d/30d/90d), paid touchpoints, intent_spiking.
   * Use to build a longitudinal engagement chart for a specific account.
   */
  getTargetAccountActivity(company_domain: string, lookback_days?: number): Promise<object[]>;
}
