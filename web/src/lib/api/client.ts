import { ENDPOINTS, withAccountId } from "@/lib/api/endpoints";
import type {
  AccountMutationResponse,
  AccountType,
  AccountsResponse,
  ApiConfig,
  BudgetSuggestionsResponse,
  BudgetTargetMutationResponse,
  BudgetTargetsResponse,
  CategoryMutationResponse,
  CategoriesResponse,
  DeleteSuccessResponse,
  GoalMutationResponse,
  GoalsAffordabilityResponse,
  RecomputeRecurringResponse,
  RecurringRuleMutationResponse,
  RecurringRulesResponse,
  RecurringRuleStatus,
  TransactionsResponse,
  UpdateTransactionCategoryResponse,
} from "@/lib/api/types";
import { clearStoredSession, getStoredUser } from "@/lib/auth/storage";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

type QueryValue = string | number | boolean | null | undefined;
type QueryParams = Record<string, QueryValue>;

export class ApiError extends Error {
  status: number;
  requestId: string | null;

  constructor(message: string, status = 500, requestId: string | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.requestId = requestId;
  }
}

type RequestOptions = Omit<RequestInit, "body"> & {
  accountId?: string | null;
  body?: BodyInit | JsonValue | Record<string, unknown> | null;
  query?: QueryParams;
};

let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

function buildPath(path: string, query?: QueryParams, accountId?: string | null) {
  const url = new URL(withAccountId(path, accountId), window.location.origin);

  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }

    url.searchParams.set(key, String(value));
  });

  return `${url.pathname}${url.search}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === "[object Object]";
}

async function parseResponse(response: Response) {
  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  return response.text();
}

async function parseApiError(response: Response) {
  const payload = await parseResponse(response).catch(() => null);
  const detail =
    typeof payload === "object" &&
    payload !== null &&
    "detail" in payload &&
    typeof payload.detail === "string"
      ? payload.detail
      : `Request failed with status ${response.status}`;

  const requestId =
    typeof payload === "object" &&
    payload !== null &&
    "request_id" in payload &&
    typeof payload.request_id === "string"
      ? payload.request_id
      : response.headers.get("X-Request-ID");

  return new ApiError(detail, response.status, requestId);
}

async function request<T>(path: string, options: RequestOptions = {}) {
  const accessToken = getStoredUser().accessToken;

  if (!accessToken) {
    clearStoredSession();
    unauthorizedHandler?.();
    throw new ApiError("Authentication required", 401);
  }

  const headers = new Headers(options.headers ?? {});
  headers.set("Authorization", `Bearer ${accessToken}`);

  let body = options.body;

  if (body !== undefined && body !== null && !(body instanceof FormData)) {
    if (isPlainObject(body) || Array.isArray(body)) {
      body = JSON.stringify(body);
    }

    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
  }

  const response = await fetch(buildPath(path, options.query, options.accountId), {
    ...options,
    body: body as BodyInit | null | undefined,
    headers,
  });

  if (response.status === 401) {
    clearStoredSession();
    unauthorizedHandler?.();
    throw new ApiError("Unauthorized", 401, response.headers.get("X-Request-ID"));
  }

  if (!response.ok) {
    throw await parseApiError(response);
  }

  return (await parseResponse(response)) as T;
}

async function publicRequest<T>(path: string, options: RequestInit = {}) {
  const response = await fetch(path, options);

  if (!response.ok) {
    throw await parseApiError(response);
  }

  return (await parseResponse(response)) as T;
}

export const apiClient = {
  get: <T>(path: string, options?: Omit<RequestOptions, "method">) =>
    request<T>(path, { ...options, method: "GET" }),
  post: <T>(path: string, options?: Omit<RequestOptions, "method">) =>
    request<T>(path, { ...options, method: "POST" }),
  patch: <T>(path: string, options?: Omit<RequestOptions, "method">) =>
    request<T>(path, { ...options, method: "PATCH" }),
  delete: <T>(path: string, options?: Omit<RequestOptions, "method">) =>
    request<T>(path, { ...options, method: "DELETE" }),
  publicGet: <T>(path: string, options?: RequestInit) => publicRequest<T>(path, options),
};

export const api = {
  getConfig: () => apiClient.publicGet<ApiConfig>(ENDPOINTS.config),
  getAccounts: () => apiClient.get<AccountsResponse>(ENDPOINTS.accounts),
  createAccount: (payload: { account_type: AccountType; name: string }) =>
    apiClient.post<AccountMutationResponse>(ENDPOINTS.accounts, {
      body: payload,
    }),
  updateAccount: (
    accountId: string,
    payload: {
      account_type?: AccountType;
      is_default?: boolean;
      name?: string;
    },
  ) =>
    apiClient.patch<AccountMutationResponse>(ENDPOINTS.account(accountId), {
      body: payload,
    }),
  deleteAccount: (accountId: string) =>
    apiClient.delete<DeleteSuccessResponse>(ENDPOINTS.account(accountId)),
  getCategories: () => apiClient.get<CategoriesResponse>(ENDPOINTS.categories),
  createCustomCategory: (name: string, keywords: string[] = []) =>
    apiClient.post<CategoryMutationResponse>(ENDPOINTS.categories, {
      body: { name, keywords },
    }),
  updateCategoryKeywords: (category: string, keywords: string[]) =>
    apiClient.patch<CategoryMutationResponse>(
      ENDPOINTS.categoryKeywords(category),
      {
        body: { keywords },
      },
    ),
  deleteCategory: (category: string) =>
    apiClient.delete<DeleteSuccessResponse>(ENDPOINTS.category(category)),
  getTransactions: (accountId = "all") =>
    apiClient.get<TransactionsResponse>(ENDPOINTS.transactions, { accountId }),
  updateTransactionCategory: (transactionId: string, category: string) =>
    apiClient.patch<UpdateTransactionCategoryResponse>(
      ENDPOINTS.transactionCategory(transactionId),
      { body: { category } },
    ),
  getBudgetTargets: () =>
    apiClient.get<BudgetTargetsResponse>(ENDPOINTS.budgetTargets),
  setBudgetTarget: (
    category: string,
    targetAmount: number,
    thresholdPercent = 80,
  ) =>
    apiClient.post<BudgetTargetMutationResponse>(ENDPOINTS.budgetTargets, {
      body: {
        category,
        target_amount: targetAmount,
        threshold_percent: thresholdPercent,
      },
    }),
  updateBudgetTarget: (
    category: string,
    payload: {
      target_amount?: number;
      threshold_percent?: number;
    },
  ) =>
    apiClient.patch<BudgetTargetMutationResponse>(
      ENDPOINTS.budgetTarget(category),
      {
        body: payload,
      },
    ),
  deleteBudgetTarget: (category: string) =>
    apiClient.delete<DeleteSuccessResponse>(ENDPOINTS.budgetTarget(category)),
  getBudgetSuggestions: (accountId = "all") =>
    apiClient.get<BudgetSuggestionsResponse>(ENDPOINTS.budgetSuggestions, {
      accountId,
    }),
  createGoal: (payload: {
    account_scope: string;
    current_saved: number;
    goal_type: string;
    name: string;
    target_amount: number;
    target_date: string;
  }) =>
    apiClient.post<GoalMutationResponse>(ENDPOINTS.goals, {
      body: payload,
    }),
  archiveGoal: (goalId: string) =>
    apiClient.delete<DeleteSuccessResponse>(ENDPOINTS.goal(goalId)),
  getGoalsAffordability: (status = "active") =>
    apiClient.get<GoalsAffordabilityResponse>(ENDPOINTS.goalsAffordability, {
      query: { status },
    }),
  getRecurring: ({
    accountId = "all",
    includeUpcoming = true,
    status = "active",
  }: {
    accountId?: string;
    includeUpcoming?: boolean;
    status?: RecurringRuleStatus | "all";
  }) =>
    apiClient.get<RecurringRulesResponse>(ENDPOINTS.recurring, {
      accountId,
      query: {
        include_upcoming: includeUpcoming,
        status,
      },
    }),
  createRecurringRule: (payload: {
    account_id: string;
    average_amount: number;
    cadence: string;
    category: string;
    confidence: number;
    display_name: string;
    next_expected_date: string;
    status: RecurringRuleStatus;
  }) =>
    apiClient.post<RecurringRuleMutationResponse>(ENDPOINTS.recurring, {
      body: payload,
    }),
  updateRecurringRule: (
    ruleId: string,
    payload: { category?: string; status?: RecurringRuleStatus },
  ) =>
    apiClient.patch<RecurringRuleMutationResponse>(ENDPOINTS.recurringRule(ruleId), {
      body: payload,
    }),
  recomputeRecurring: ({
    accountId = "all",
    lookbackMonths = 12,
    minOccurrences = 3,
  }: {
    accountId?: string;
    lookbackMonths?: number;
    minOccurrences?: number;
  }) =>
    apiClient.post<RecomputeRecurringResponse>(ENDPOINTS.recurringRecompute, {
      body: {
        account_id: accountId,
        lookback_months: lookbackMonths,
        min_occurrences: minOccurrences,
      },
    }),
};
