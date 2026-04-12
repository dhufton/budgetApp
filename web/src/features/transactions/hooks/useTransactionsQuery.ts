import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api/client";

export function useTransactionsQuery(accountId: string) {
  return useQuery({
    queryKey: ["transactions", accountId],
    queryFn: () => api.getTransactions(accountId),
    placeholderData: (previousData) => previousData,
  });
}
