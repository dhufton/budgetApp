import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api/client";
import type { TransactionsResponse } from "@/lib/api/types";

type UpdateTransactionCategoryVariables = {
  transactionId: string;
  category: string;
};

type MutationContext = {
  previousEntries: Array<[readonly unknown[], TransactionsResponse | undefined]>;
};

type UseUpdateTransactionCategoryMutationOptions = {
  additionalInvalidationKeys?: ReadonlyArray<readonly unknown[]>;
};

export function useUpdateTransactionCategoryMutation(
  options: UseUpdateTransactionCategoryMutationOptions = {},
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ category, transactionId }: UpdateTransactionCategoryVariables) =>
      api.updateTransactionCategory(transactionId, category),
    onMutate: async (variables): Promise<MutationContext> => {
      await queryClient.cancelQueries({ queryKey: ["transactions"] });

      const previousEntries = queryClient.getQueriesData<TransactionsResponse>({
        queryKey: ["transactions"],
      });

      queryClient.setQueriesData<TransactionsResponse>(
        { queryKey: ["transactions"] },
        (current) => {
          if (!current) {
            return current;
          }

          return {
            transactions: current.transactions.map((transaction) =>
              transaction.id === variables.transactionId
                ? { ...transaction, category: variables.category }
                : transaction,
            ),
          };
        },
      );

      return { previousEntries };
    },
    onError: (_error, _variables, context) => {
      context?.previousEntries.forEach(([queryKey, previousData]) => {
        queryClient.setQueryData(queryKey, previousData);
      });
    },
    onSuccess: async () => {
      await Promise.all(
        (options.additionalInvalidationKeys ?? []).map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}
