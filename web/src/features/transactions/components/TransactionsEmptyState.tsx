import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

type TransactionsEmptyStateProps = {
  kind: "no-transactions" | "no-results";
  onShowAll?: () => void;
};

export function TransactionsEmptyState({
  kind,
  onShowAll,
}: TransactionsEmptyStateProps) {
  if (kind === "no-transactions") {
    return (
      <EmptyState
        description="No transactions were returned for this account scope yet. Upload a statement from the dashboard to populate the ledger."
        title="No transactions found"
      />
    );
  }

  return (
    <EmptyState
      action={
        onShowAll ? (
          <Button onClick={onShowAll} variant="secondary">
            Show all transactions
          </Button>
        ) : null
      }
      description="No transactions match the current category status filter."
      title="No matching transactions"
    />
  );
}
