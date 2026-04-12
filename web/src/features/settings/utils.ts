import type {
  Account,
  GoalAffordabilityVerdict,
  GoalType,
  RecurringCadence,
} from "@/lib/api/types";

const currencyFormatter = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function formatCurrency(value: number) {
  return currencyFormatter.format(Number.isFinite(value) ? value : 0);
}

export function formatDate(value?: string | null) {
  if (!value) {
    return "Not scheduled";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return dateFormatter.format(parsed);
}

export function formatAccountScope(scope: string, accounts: Account[]) {
  if (!scope || scope === "all") {
    return "All accounts";
  }

  return accounts.find((account) => account.id === scope)?.name ?? "Unknown account";
}

export function getDefaultAccountId(accounts: Account[]) {
  return accounts.find((account) => account.is_default)?.id ?? accounts[0]?.id ?? "";
}

export function recurringCadenceLabel(cadence: string) {
  const value = String(cadence).toLowerCase() as RecurringCadence;
  switch (value) {
    case "weekly":
      return "Weekly";
    case "biweekly":
      return "Biweekly";
    case "monthly":
      return "Monthly";
    default:
      return "Irregular";
  }
}

export function goalTypeLabel(goalType: string) {
  return goalType === ("savings_target" satisfies GoalType)
    ? "Savings target"
    : "Planned purchase";
}

export function goalVerdictMeta(verdict: GoalAffordabilityVerdict) {
  switch (verdict) {
    case "can_afford_now":
      return {
        label: "Can afford now",
        tone: "success" as const,
      };
    case "can_afford_by_date":
      return {
        label: "On track by date",
        tone: "accent" as const,
      };
    default:
      return {
        label: "Not yet affordable",
        tone: "danger" as const,
      };
  }
}

export function normalizeKeyword(keyword: string) {
  return keyword.trim().replace(/,$/, "");
}

export function dedupeKeywords(keywords: string[]) {
  const seen = new Set<string>();
  const deduped: string[] = [];

  keywords.forEach((keyword) => {
    const trimmed = normalizeKeyword(keyword);
    const normalized = trimmed.toLowerCase();

    if (!trimmed || seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    deduped.push(trimmed);
  });

  return deduped;
}

export function keywordListsEqual(left: string[], right: string[]) {
  const normalizedLeft = dedupeKeywords(left);
  const normalizedRight = dedupeKeywords(right);

  if (normalizedLeft.length !== normalizedRight.length) {
    return false;
  }

  return normalizedLeft.every(
    (keyword, index) => keyword.toLowerCase() === normalizedRight[index]?.toLowerCase(),
  );
}

export function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
