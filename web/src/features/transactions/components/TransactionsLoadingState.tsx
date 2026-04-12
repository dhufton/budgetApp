import { LoadingState } from "@/components/ui/LoadingState";

export function TransactionsLoadingState() {
  return (
    <LoadingState
      title="Loading transactions"
      description="Fetching account-scoped transactions from the existing FastAPI endpoint."
    />
  );
}
