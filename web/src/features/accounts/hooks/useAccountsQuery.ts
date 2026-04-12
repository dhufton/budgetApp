import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api/client";

export function useAccountsQuery() {
  return useQuery({
    queryKey: ["accounts"],
    queryFn: api.getAccounts,
  });
}
