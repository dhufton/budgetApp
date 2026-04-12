import { Select } from "@/components/ui/Select";
import { cx } from "@/lib/utils/cx";

type TransactionCategorySelectProps = {
  categories: string[];
  disabled?: boolean;
  isPending?: boolean;
  value: string;
  onChange: (nextValue: string) => void;
};

export function TransactionCategorySelect({
  categories,
  disabled = false,
  isPending = false,
  onChange,
  value,
}: TransactionCategorySelectProps) {
  const isUncategorized = value === "Uncategorized";

  return (
    <div className="transaction-category-select">
      <Select
        aria-label="Transaction category"
        className={cx(
          "transaction-category-select__control",
          isUncategorized && "transaction-category-select__control--uncategorized",
          isPending && "transaction-category-select__control--pending",
        )}
        disabled={disabled || isPending}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {categories.map((category) => (
          <option key={category} value={category}>
            {category}
          </option>
        ))}
      </Select>
      {isPending ? (
        <span className="transaction-category-select__status">Saving…</span>
      ) : null}
    </div>
  );
}
