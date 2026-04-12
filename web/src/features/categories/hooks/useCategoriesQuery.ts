import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api/client";

export function useCategoriesQuery() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: api.getCategories,
    staleTime: 5 * 60_000,
  });
}
