export type ApiConfig = {
  supabase_url: string | null;
  supabase_key: string | null;
};

export type Account = {
  id: string;
  name: string;
  account_type: "current" | "credit" | "savings" | "other";
  is_default: boolean;
  created_at?: string;
};

export type AccountType = Account["account_type"];

export type AccountsResponse = {
  accounts: Account[];
};

export type AccountMutationResponse = {
  success: boolean;
  account?: Account | null;
};

export type CategorySummary = {
  name: string;
  builtin_keywords: string[];
  extra_keywords: string[];
  is_builtin: boolean;
};

export type CategoriesResponse = {
  categories: string[];
  all_categories: CategorySummary[];
};

export type CategoryMutationResponse = {
  success: boolean;
  name?: string;
  keywords?: string[];
};

export type TransactionRecord = {
  id: string;
  date: string;
  description: string;
  category: string;
  amount: number;
  account_id?: string | null;
  excluded_from_budget?: boolean;
};

export type TransactionsResponse = {
  transactions: TransactionRecord[];
};

export type UpdateTransactionCategoryResponse = {
  success: boolean;
  data?: Array<Record<string, unknown>>;
};

export type BudgetTarget = {
  category: string;
  target_amount: number;
  threshold_percent: number;
};

export type BudgetTargetsResponse = {
  targets: BudgetTarget[];
};

export type BudgetTargetMutationResponse = {
  success: boolean;
  data?: BudgetTarget[] | Array<Record<string, unknown>>;
};

export type BudgetSuggestionsResponse = {
  suggestions: Record<string, number>;
  based_on_months: number;
};

export type GoalType = "savings_target" | "planned_purchase";
export type GoalStatus = "active" | "completed" | "archived";
export type GoalAffordabilityVerdict =
  | "can_afford_now"
  | "can_afford_by_date"
  | "not_yet";

export type GoalRecord = {
  id: string;
  account_scope: string;
  current_saved: number;
  goal_type: GoalType;
  name: string;
  notes?: string | null;
  status: GoalStatus;
  target_amount: number;
  target_date: string;
  updated_at?: string;
};

export type GoalAffordability = {
  avg_net_monthly_saving: number;
  goal_id: string;
  months_remaining: number;
  projected_saved_by_date: number;
  remaining_amount: number;
  required_monthly_saving: number;
  safe_monthly_saving: number;
  verdict: GoalAffordabilityVerdict;
};

export type GoalsAffordabilityItem = {
  goal: GoalRecord;
  affordability: GoalAffordability;
};

export type GoalsAffordabilityResponse = {
  items: GoalsAffordabilityItem[];
};

export type GoalMutationResponse = {
  success: boolean;
  goal?: GoalRecord | null;
};

export type RecurringCadence = "weekly" | "biweekly" | "monthly" | "irregular";
export type RecurringRuleStatus = "active" | "ignored";

export type RecurringRule = {
  id: string;
  account_id: string;
  average_amount: number;
  cadence: RecurringCadence;
  category: string;
  confidence: number;
  display_name: string;
  due_in_days?: number | null;
  last_seen_date?: string | null;
  merchant_key: string;
  next_expected_date?: string | null;
  occurrence_count: number;
  status: RecurringRuleStatus;
};

export type RecurringRulesResponse = {
  rules: RecurringRule[];
};

export type RecurringRuleMutationResponse = {
  success: boolean;
  rule?: RecurringRule | null;
};

export type RecomputeRecurringResponse = {
  rules_created: number;
  rules_updated: number;
  scanned_transactions: number;
};

export type DeleteSuccessResponse = {
  success: boolean;
};
