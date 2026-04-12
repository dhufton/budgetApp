import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

type UncategorizedAlertProps = {
  count: number;
  isGeneratingSuggestions: boolean;
  isRecategorising: boolean;
  message?: {
    tone: "error" | "success";
    text: string;
  } | null;
  onGenerateSuggestions: () => void;
  onRecategorise: () => void;
};

export function UncategorizedAlert({
  count,
  isGeneratingSuggestions,
  isRecategorising,
  message,
  onGenerateSuggestions,
  onRecategorise,
}: UncategorizedAlertProps) {
  if (!count && !message) {
    return null;
  }

  return (
    <Card
      actions={
        <div className="dashboard-alert-card__actions">
          <Button
            disabled={isGeneratingSuggestions || isRecategorising}
            onClick={onGenerateSuggestions}
            variant="secondary"
          >
            {isGeneratingSuggestions
              ? "Generating suggestions…"
              : "Generate AI suggestions"}
          </Button>
          <Button
            disabled={isGeneratingSuggestions || isRecategorising}
            onClick={onRecategorise}
          >
            {isRecategorising
              ? "Recategorising…"
              : "Recategorise uncategorised"}
          </Button>
        </div>
      }
      className="dashboard-alert-card"
      description={
        count
          ? `${count} transaction${
              count === 1 ? "" : "s"
            } still need categorisation in the current scope.`
          : "No uncategorised transactions remain in the selected account scope."
      }
      title="Uncategorized transactions"
    >
      {message ? (
        <p className={`message message--${message.tone}`}>{message.text}</p>
      ) : null}
    </Card>
  );
}
