import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api/client";
import { settingsQueryKeys } from "@/features/settings/hooks/queryKeys";

type GoalStatusFilter = "active" | "completed" | "archived" | "all";

export function useGoalsAffordabilityQuery(status: GoalStatusFilter = "active") {
  return useQuery({
    queryKey: settingsQueryKeys.goalsAffordability(status),
    queryFn: () => api.getGoalsAffordability(status),
    placeholderData: (previousData) => previousData,
  });
}
