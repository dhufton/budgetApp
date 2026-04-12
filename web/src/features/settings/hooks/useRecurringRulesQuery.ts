import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api/client";
import type { RecurringRuleStatus } from "@/lib/api/types";
import { settingsQueryKeys } from "@/features/settings/hooks/queryKeys";

export function useRecurringRulesQuery(
  accountId: string,
  status: RecurringRuleStatus,
) {
  return useQuery({
    queryKey: settingsQueryKeys.recurring(accountId, status),
    queryFn: () => api.getRecurring({ accountId, status, includeUpcoming: true }),
    placeholderData: (previousData) => previousData,
  });
}
