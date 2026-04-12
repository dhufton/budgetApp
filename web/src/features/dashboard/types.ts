import type { TransactionRecord } from "@/lib/api/types";

export type DashboardTransaction = TransactionRecord;

export type UploadStatementResponse = {
  success: boolean;
  message: string;
  transactions?: number;
  categorised?: number;
  storage_path?: string;
  review_id?: string | null;
};

export type UploadBatchResult = {
  successCount: number;
  duplicateCount: number;
  errorCount: number;
  uploadedFiles: string[];
  postProcessWarnings: string[];
};

export type CategoriseTransactionsResponse = {
  message?: string;
  changed?: number;
};

export type CategoriseSuggestResponse = {
  run_id: string;
  uncategorised_total: number;
  suggested_total: number;
  auto_applied: number;
  needs_review: number;
  failed: number;
};

export type CategorisationBatchResponse = {
  success: boolean;
  requested?: number;
  changed?: number;
  threshold?: number;
  candidate_count?: number;
};

export type ReviewQueueSuggestion = {
  id: string;
  transaction_id: string;
  suggested_category: string;
  confidence: number;
  reason: string;
  created_at?: string;
  account_id?: string | null;
};

export type ReviewQueueTransaction = {
  id: string;
  description: string;
  amount: number;
  date: string;
  account_id?: string | null;
  category?: string;
};

export type ReviewQueueItem = {
  id: string;
  suggestion: ReviewQueueSuggestion;
  transaction: ReviewQueueTransaction;
};

export type ReviewQueueResponse = {
  items: ReviewQueueItem[];
  count: number;
};

export type BudgetHealthCategory = {
  category: string;
  target: number;
  actual: number;
  remaining: number;
  percent_used: number;
  threshold_percent: number;
  status: "on_track" | "at_risk" | "over_budget" | "no_target";
};

export type BudgetHealthResponse = {
  month: string;
  summary: {
    target_total: number;
    actual_total: number;
  };
  categories: BudgetHealthCategory[];
};

export type BudgetTrendSeriesPoint = {
  month: string;
  category: string;
  target: number;
  actual: number;
  threshold_percent: number;
  status: "on_track" | "at_risk" | "over_budget" | "no_target";
};

export type BudgetTrendResponse = {
  months: string[];
  categories: string[];
  series: BudgetTrendSeriesPoint[];
};

export type RecurringUpcomingItem = {
  rule_id: string;
  display_name: string;
  expected_date: string;
  expected_amount: number;
  category: string;
  confidence?: number;
  account_id?: string | null;
};

export type RecurringUpcomingResponse = {
  items: RecurringUpcomingItem[];
};

export type ReviewTotals = {
  spent: number;
  income: number;
  net: number;
  transaction_count: number;
};

export type ReviewBudgetVarianceItem = {
  category: string;
  target: number;
  actual: number;
  variance: number;
  pct_used: number;
};

export type ReviewCategoryChangeItem = {
  category: string;
  previous: number;
  current: number;
  delta: number;
  delta_pct: number;
};

export type ReviewTopMerchant = {
  merchant: string;
  amount: number;
  count: number;
};

export type ReviewFlag = {
  type: string;
  category?: string;
  severity?: string;
};

export type ReviewSummary = {
  totals?: ReviewTotals;
  budget_variance?: ReviewBudgetVarianceItem[];
  top_merchants?: ReviewTopMerchant[];
  category_changes_vs_previous?: ReviewCategoryChangeItem[];
  flags?: ReviewFlag[];
  meta?: {
    currency?: string;
    account_scope?: string;
    source_statement_id?: string | null;
    period_start?: string;
    period_end?: string;
  };
};

export type ReviewRecord = {
  id: string;
  review_type: "monthly_closeout" | "upload_snapshot" | string;
  triggered_by?: string;
  period_start: string;
  period_end: string;
  account_scope?: string;
  created_at: string;
  statement_id?: string | null;
  summary?: ReviewSummary;
};

export type LatestReviewResponse = {
  review: ReviewRecord | null;
};

export type ReviewHistoryResponse = {
  reviews: ReviewRecord[];
};

export type UpdateRecurringRuleResponse = {
  success: boolean;
  rule?: Record<string, unknown>;
};
