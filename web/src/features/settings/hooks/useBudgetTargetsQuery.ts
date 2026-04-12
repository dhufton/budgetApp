import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api/client";
import { settingsQueryKeys } from "@/features/settings/hooks/queryKeys";

export function useBudgetTargetsQuery() {
  return useQuery({
    queryKey: settingsQueryKeys.budgetTargets,
    queryFn: api.getBudgetTargets,
  });
}
