export const settingsQueryKeys = {
  budgetTargets: ["budget-targets"] as const,
  goalsAffordability: (status: string) => ["goals-affordability", status] as const,
  recurring: (accountId: string, status: string) =>
    ["recurring", accountId, status] as const,
};
