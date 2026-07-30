/**
 * Copyright 2026 @kenlim5656. All rights reserved.
 * Licensed under the Business Source License 1.1 (BSL 1.1)
 * Persistent Attribution Required. See /LICENSE and /NOTICE for terms.
 * Central Suite Repository: https://github.com/kenlim5656/paid-media-suite
 */
// ─── Platforms ────────────────────────────────────────────────────────────────

export type Platform =
  | "google_ads"
  | "dv360"
  | "sa360"
  | "cm360"
  | "meta"
  | "linkedin"
  | "tiktok"
  | "twitter_x"
  | "pinterest"
  | "snapchat"
  | "microsoft_ads"
  | "amazon_ads"
  | "reddit"
  | "youtube"
  | "other";

export type CampaignStatus = "active" | "paused" | "ended" | "draft" | "archived";
export type CampaignObjective =
  | "awareness"
  | "reach"
  | "traffic"
  | "engagement"
  | "video_views"
  | "lead_generation"
  | "app_installs"
  | "conversions"
  | "catalog_sales"
  | "store_visits";

// ─── Accounts ─────────────────────────────────────────────────────────────────

export interface Account {
  id: string;
  name: string;
  platform: Platform;
  platform_account_id: string;
  team_id: string;
  status: "active" | "inactive";
  currency: string;
  timezone: string;
  monthly_budget?: number;
  notes?: string;
}

// ─── Teams ────────────────────────────────────────────────────────────────────

export interface Team {
  id: string;
  name: string;
  description: string;
  objectives: CampaignObjective[];
  primary_kpis: string[];
  account_ids: string[];
  member_ids: string[];
  lead_id: string;
  platforms: Platform[];
  reporting_cadence: "daily" | "weekly" | "biweekly" | "monthly";
  budget_owner: string;
  notes?: string;
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role:
    | "media_buyer"
    | "media_planner"
    | "analyst"
    | "strategist"
    | "manager"
    | "director"
    | "other";
  team_ids: string[];
  platform_specialties: Platform[];
  responsibilities: string[];
  notes?: string;
}

// ─── Campaigns ────────────────────────────────────────────────────────────────

export interface Budget {
  type: "daily" | "lifetime" | "monthly";
  amount: number;
  currency: string;
  pacing?: "standard" | "accelerated";
}

export interface Targeting {
  geo?: string[];
  audience_segments?: string[];
  age_range?: { min: number; max: number };
  gender?: "all" | "male" | "female" | "unknown";
  devices?: ("desktop" | "mobile" | "tablet" | "connected_tv")[];
  dayparting?: string[];
  custom_audiences?: string[];
  keyword_themes?: string[];
}

export interface Campaign {
  id: string;
  name: string;
  platform: Platform;
  account_id: string;
  team_id: string;
  status: CampaignStatus;
  objective: CampaignObjective;
  budget: Budget;
  start_date: string;
  end_date?: string;
  targeting?: Targeting;
  creative_themes?: string[];
  funnel_stage?: "upper" | "mid" | "lower";
  tags?: string[];
  notes?: string;
}

// ─── Performance ──────────────────────────────────────────────────────────────

export interface PerformanceMetrics {
  impressions?: number;
  clicks?: number;
  spend?: number;
  reach?: number;
  frequency?: number;
  ctr?: number;
  cpc?: number;
  cpm?: number;
  cpa?: number;
  roas?: number;
  conversions?: number;
  conversion_value?: number;
  video_views?: number;
  video_view_rate?: number;
  view_through_conversions?: number;
  custom_metrics?: Record<string, number>;
}

export interface PerformanceRecord {
  campaign_id: string;
  date: string;
  metrics: PerformanceMetrics;
}

export interface HistoricalPerformance {
  records: PerformanceRecord[];
  benchmarks?: {
    platform: Platform;
    objective: CampaignObjective;
    industry?: string;
    avg_ctr?: number;
    avg_cpc?: number;
    avg_cpm?: number;
    avg_cpa?: number;
    avg_roas?: number;
  }[];
}

// ─── Attribution ──────────────────────────────────────────────────────────────

export type AttributionModel =
  | "last_click"
  | "first_click"
  | "linear"
  | "time_decay"
  | "position_based"
  | "data_driven"
  | "custom";

export interface AttributionWindow {
  click: number;
  view?: number;
  unit: "days" | "hours";
}

export interface AttributionConfiguration {
  id: string;
  name: string;
  model: AttributionModel;
  window: AttributionWindow;
  platforms_applied: Platform[];
  conversion_events: string[];
  cross_device: boolean;
  view_through_enabled: boolean;
  description: string;
  use_cases: string[];
  notes?: string;
}

// ─── Reporting ────────────────────────────────────────────────────────────────

export type ReportType =
  | "performance_summary"
  | "pacing"
  | "budget_flight"
  | "audience_insights"
  | "creative_analysis"
  | "channel_mix"
  | "attribution_path"
  | "executive_summary"
  | "custom";

export interface ReportingTemplate {
  id: string;
  name: string;
  type: ReportType;
  audience: "executive" | "media_team" | "client" | "internal";
  cadence: "daily" | "weekly" | "monthly" | "quarterly" | "ad_hoc";
  metrics_included: string[];
  dimensions: string[];
  visualizations: string[];
  delivery_format: ("pdf" | "google_sheets" | "looker_studio" | "email" | "slack")[];
  sections: {
    title: string;
    description: string;
    metrics?: string[];
  }[];
  notes?: string;
}

// ─── Assets ───────────────────────────────────────────────────────────────────

export type AssetType = "image" | "video" | "copy" | "audio" | "html5" | "document" | "other";

export interface AssetSpec {
  platform: Platform;
  format: string;
  dimensions?: string;
  max_file_size?: string;
  aspect_ratio?: string;
  duration_max?: string;
  notes?: string;
}

export interface AssetCategory {
  id: string;
  name: string;
  type: AssetType;
  location_url?: string;
  naming_convention?: string;
  specs?: AssetSpec[];
  notes?: string;
}

export interface AssetLibrary {
  dam_system?: string;
  dam_url?: string;
  access_instructions?: string;
  brand_guidelines_url?: string;
  copy_guidelines_url?: string;
  categories: AssetCategory[];
  notes?: string;
}

// ─── Testing ──────────────────────────────────────────────────────────────────

export type TestStatus = "planned" | "active" | "completed" | "paused" | "abandoned";

// Campaign-level test types: A/B experiments run within or across campaigns.
// Vendor/partner evaluation types: structured evaluations of external partners, platforms, or tools.
export type TestType =
  | "creative" | "audience" | "bidding" | "landing_page" | "copy" | "format" | "offer"
  | "ad_network" | "dsp" | "agency" | "platform" | "tool"
  | "other";

export interface TestingMethodology {
  confidence_threshold: number;
  require_stat_sig: boolean;
  minimum_sample_size?: number;
  minimum_test_duration_days?: number;
  minimum_detectable_effect_pct?: number;
  winner_criteria: string;
  holdout_group?: boolean;
  notes?: string;
}

export interface TestingTool {
  id: string;
  name: string;
  type: "platform_native" | "third_party" | "internal";
  platform?: Platform;
  url?: string;
  used_for: string[];
  notes?: string;
}

export interface TestVariant {
  id: string;
  name: string;
  description: string;
  is_control: boolean;
}

export interface TestResults {
  winner_variant_id?: string;
  stat_sig_achieved: boolean;
  confidence_level?: number;
  primary_metric: string;
  primary_metric_lift_pct?: number;
  sample_size?: number;
  conclusion: string;
  action_taken?: string;
  results_url?: string;
}

// Extra context for vendor, platform, DSP, agency, and tool evaluations.
// Not used for in-campaign A/B tests.
export interface VendorContext {
  subject: string;                 // Short label, e.g. "DV360 vs. The Trade Desk"
  incumbent?: string;              // Existing vendor / current approach being compared against
  challenger?: string;             // New vendor / approach being evaluated
  budget_tested?: number;          // Spend allocated to the evaluation period
  contract_value?: number;         // Annual contract value at stake (if applicable)
  evaluation_criteria?: string[];  // KPIs or factors that determine the winner
  stakeholders?: string[];         // People/teams involved in the decision
  recommendation?: string;         // Final recommendation (for completed evaluations)
}

export interface Test {
  id: string;
  name: string;
  hypothesis: string;
  status: TestStatus;
  type: TestType;
  campaign_id?: string;
  team_id?: string;
  platform?: Platform;
  start_date?: string;
  end_date?: string;
  variants: TestVariant[];
  results?: TestResults;
  vendor_context?: VendorContext;  // Populated for dsp/agency/platform/ad_network/tool tests
  tags?: string[];
  notes?: string;
}

export interface TestingProgram {
  methodology: TestingMethodology;
  tools: TestingTool[];
  tests: Test[];
}

// ─── Audiences ────────────────────────────────────────────────────────────────

export type FirstPartyAudienceType =
  | "crm_list"
  | "pixel_based"
  | "customer_match"
  | "email_list"
  | "app_users"
  | "lookalike_seed"
  | "suppression"
  | "other";

export interface FirstPartyAudience {
  id: string;
  name: string;
  type: FirstPartyAudienceType;
  description: string;
  business_unit?: string;
  size_estimate?: number;
  platforms_available: Platform[];
  refresh_cadence?: string;
  source?: string;
  onboarding_platform_id?: string;
  tags?: string[];
  notes?: string;
}

export interface DataProvider {
  id: string;
  name: string;
  contract_status: "active" | "expired" | "negotiating" | "evaluating";
  segments_available?: string[];
  platforms_available: Platform[];
  contact?: string;
  contract_end_date?: string;
  annual_cost?: number;
  notes?: string;
}

export interface OnboardingPlatform {
  id: string;
  name: string;
  type: "clean_room" | "data_onboarding" | "identity_resolution" | "cdp";
  platforms_connected: Platform[];
  use_cases: string[];
  contact?: string;
  notes?: string;
}

export interface LookalikeStrategyEntry {
  seed_audience_id: string;
  seed_audience_name: string;
  platform: Platform;
  expansion_percentages: number[];
  best_performing_expansion?: number;
  notes?: string;
}

export interface ThirdPartyAudienceLayer {
  id: string;
  name: string;
  provider: string;
  category: string;
  platforms_available: Platform[];
  is_default: boolean;
  is_best_performer: boolean;
  cpm_premium_estimate?: number;
  performance_notes?: string;
}

export interface AudienceLibrary {
  business_unit?: string;
  first_party_audiences: FirstPartyAudience[];
  data_providers: DataProvider[];
  onboarding_platforms: OnboardingPlatform[];
  lookalike_strategy: {
    default_expansion_pct?: number;
    entries: LookalikeStrategyEntry[];
    notes?: string;
  };
  third_party_layers: ThirdPartyAudienceLayer[];
}

// ─── Measurement ──────────────────────────────────────────────────────────────

export type TmsSystem =
  | "google_tag_manager"
  | "tealium"
  | "adobe_launch"
  | "segment"
  | "mparticle"
  | "manual"
  | "other";

export interface TagManagement {
  system: TmsSystem;
  system_name?: string;
  container_id?: string;
  implementation_type: "client_side" | "server_side" | "hybrid";
  server_side_endpoint?: string;
  notes?: string;
}

export interface PixelTag {
  id: string;
  name: string;
  platform: Platform;
  pixel_id: string;
  implementation: "client_side" | "server_side" | "both";
  events_tracked: string[];
  custom_parameters?: string[];
  notes?: string;
}

export interface ConversionAPI {
  id: string;
  platform: Platform;
  api_name: string;
  implementation: "server_side" | "client_side_fallback" | "both";
  events_sent: string[];
  match_rate_estimate_pct?: number;
  deduplication_method?: string;
  notes?: string;
}

export interface CM360UVariable {
  variable: string;
  name: string;
  type: "number" | "string";
  description: string;
  example_value?: string;
}

export interface CM360Setup {
  account_id: string;
  floodlight_configuration_id: string;
  u_variables: CM360UVariable[];
  custom_channels?: string[];
  notes?: string;
}

export interface WebsiteDataCapture {
  data_layer_implemented: boolean;
  data_layer_spec_url?: string;
  data_layer_variables?: string[];
  analytics_platform?: string;
  analytics_property_id?: string;
  first_party_cookies_implemented: boolean;
  cookie_domain?: string;
  cookie_session_duration?: string;
  cookie_data_captured?: string[];
  notes?: string;
}

export interface MeasurementPartner {
  id: string;
  name: string;
  type: "mmm" | "incrementality" | "brand_lift" | "attribution" | "analytics" | "identity" | "other";
  status: "active" | "inactive" | "evaluating";
  platforms_covered: Platform[];
  cadence?: string;
  contact?: string;
  notes?: string;
}

export interface MeasurementSetup {
  tag_management: TagManagement;
  pixels_and_tags: PixelTag[];
  conversion_apis: ConversionAPI[];
  cm360?: CM360Setup;
  website_data_capture: WebsiteDataCapture;
  measurement_partners: MeasurementPartner[];
}

// ─── GMP Platform Bulk Upload Schemas ────────────────────────────────────────

export type BulkUploadPlatform = "dv360" | "sa360" | "cm360";

export interface BulkUploadField {
  column_name: string;
  description: string;
  required: boolean;
  data_type: "string" | "number" | "date" | "boolean" | "enum";
  valid_values?: string[];
  default_value?: string;
  example?: string;
  notes?: string;
}

export interface BulkUploadEntity {
  entity_type: string;
  filename?: string;
  description: string;
  fields: BulkUploadField[];
}

export interface OrgDefault {
  naming_convention?: string;
  field_defaults: Record<string, string>;
  notes?: string;
}

export interface PlatformBulkUpload {
  format: string;
  version?: string;
  documentation_url?: string;
  upload_instructions: string;
  file_naming_notes?: string;
  entities: BulkUploadEntity[];
  org_defaults: Record<string, OrgDefault>;
}

export interface PlatformConfig {
  id: BulkUploadPlatform;
  name: string;
  bulk_upload: PlatformBulkUpload;
  notes?: string;
}

export interface PlatformsConfig {
  platforms: Record<BulkUploadPlatform, PlatformConfig>;
}

// ─── Identity ─────────────────────────────────────────────────────────────────

export interface IdentityNamespace {
  namespace_id: string;
  display_name: string;
  category: string;
  vendor: string | null;
  signal_name: string;
  url_parameter?: string;
  cookie_name?: string;
  platforms: string[];
  deterministic: boolean | null;
  pii: boolean | null;
  lifetime_days: number | null;
  capture_method: string | null;
  notes: string;
}

export interface IdentityEntity {
  entity_id: string;
  entity_type: "person" | "account" | "household";
  company_domain?: string;
  company_name?: string;
  confidence_tier: "high" | "medium" | "low";
  signal_count: number;
  first_seen_at: string;
  last_seen_at: string;
  signals: {
    namespace_id: string;
    identifier_value: string;
    match_method: "deterministic" | "probabilistic" | "declarative";
    confidence_score: number;
    first_observed_at: string;
    last_observed_at: string;
  }[];
}

// ─── Attribution Results (agent output) ───────────────────────────────────────

export interface AttributionChannelSummary {
  run_id: string;
  model_name: string;
  period_start: string;
  period_end: string;
  generated_at: string;
  channel_summary: {
    platform: string;
    channel: string;
    conversion_type: string;
    attributed_conversions: number;
    attributed_value?: number;
    credit_share_pct: number;
    total_spend?: number;
    attributed_cpa?: number;
    attributed_roas?: number;
  }[];
}

export interface AttributionRun {
  run_id: string;
  model_name: string;
  period_start: string;
  period_end: string;
  paths_modeled?: number;
  conversions_attributed?: number;
  identity_match_rate?: number;
  avg_path_length?: number;
  status: "running" | "completed" | "failed" | "superseded";
  started_at: string;
  completed_at?: string;
  triggered_by?: string;
}

// ─── Agent Outputs ────────────────────────────────────────────────────────────

export interface WatchdogAlert {
  alert_id: string;
  alert_type: string;
  severity: "info" | "warning" | "critical";
  status: "open" | "acknowledged" | "resolved" | "suppressed";
  affected_namespace?: string;
  affected_platform?: string;
  metric_name?: string;
  metric_value?: number;
  threshold_value?: number;
  description: string;
  probable_cause?: string;
  recommended_action?: string;
  detected_at: string;
  resolved_at?: string;
}

export interface AnalystInsight {
  insight_id: string;
  insight_type: string;
  period_start?: string;
  period_end?: string;
  affected_platform?: string;
  affected_channel?: string;
  headline: string;
  detail?: string;
  confidence: "high" | "medium" | "low";
  has_recommendation: boolean;
  recommendation?: string;
  estimated_impact?: string;
  priority: "high" | "medium" | "low";
  status: "new" | "reviewed" | "actioned" | "dismissed";
  generated_at: string;
}

export interface OperatorPendingApproval {
  action_id: string;
  platform: string;
  action_type: string;
  platform_entity_id: string;
  campaign_id?: string;
  summary: string;
  rationale: string;
  estimated_impact?: string;
  spend_at_risk?: number;
  change_magnitude_pct?: number;
  proposed_at: string;
  expires_at?: string;
}

// ─── Top-level data store ─────────────────────────────────────────────────────

export interface PaidMediaData {
  accounts: Account[];
  teams: Team[];
  team_members: TeamMember[];
  campaigns: Campaign[];
  historical_performance: HistoricalPerformance;
  attribution_configurations: AttributionConfiguration[];
  reporting_templates: ReportingTemplate[];
  asset_library: AssetLibrary;
  testing_program: TestingProgram;
  audience_library: AudienceLibrary;
  measurement_setup: MeasurementSetup;
  platforms_config: PlatformsConfig;
  metadata: {
    company_name: string;
    industry?: string;
    primary_currency: string;
    fiscal_year_start: string;
    last_updated: string;
  };
}
