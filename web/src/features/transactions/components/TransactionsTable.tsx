import { TransactionCategorySelect } from "@/features/transactions/components/TransactionCategorySelect";
import { formatTransactionAmount, formatTransactionDate } from "@/features/transactions/utils";
import type { TransactionRecord } from "@/lib/api/types";
import { cx } from "@/lib/utils/cx";

type TransactionsTableProps = {
  categories: string[];
  categoryEditingDisabled: boolean;
  pendingTransactionId?: string;
  transactions: TransactionRecord[];
  onCategoryChange: (transactionId: string, currentCategory: string, nextCategory: string) => void;
};

export function TransactionsTable({
  categories,
  categoryEditingDisabled,
  onCategoryChange,
  pendingTransactionId,
  transactions,
}: TransactionsTableProps) {
  return (
    <>
      <div className="transactions-table" role="region" aria-label="Transactions">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Category</th>
              <th className="transactions-table__amount-column">Amount</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((transaction) => {
              const isPending = pendingTransactionId === transaction.id;
              const isUncategorized = transaction.category === "Uncategorized";

              return (
                <tr
                  className={cx(
                    "transactions-table__row",
                    isUncategorized && "transactions-table__row--uncategorized",
                  )}
                  key={transaction.id}
                >
                  <td>{formatTransactionDate(transaction.date)}</td>
                  <td className="transactions-table__description-cell">
                    {transaction.description}
                  </td>
                  <td className="transactions-table__category-cell">
                    <TransactionCategorySelect
                      categories={categories}
                      disabled={categoryEditingDisabled}
                      isPending={isPending}
                      onChange={(nextCategory) =>
                        onCategoryChange(
                          transaction.id,
                          transaction.category,
                          nextCategory,
                        )
                      }
                      value={transaction.category}
                    />
                  </td>
                  <td
                    className={cx(
                      "transactions-table__amount",
                      transaction.amount >= 0
                        ? "transactions-table__amount--positive"
                        : "transactions-table__amount--negative",
                    )}
                  >
                    {formatTransactionAmount(transaction.amount)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="transactions-mobile-list">
        {transactions.map((transaction) => {
          const isPending = pendingTransactionId === transaction.id;
          const isUncategorized = transaction.category === "Uncategorized";

          return (
            <article
              className={cx(
                "transactions-mobile-card",
                isUncategorized && "transactions-mobile-card--uncategorized",
              )}
              key={transaction.id}
            >
              <div className="transactions-mobile-card__header">
                <div>
                  <p className="transactions-mobile-card__label">Date</p>
                  <p className="transactions-mobile-card__value">
                    {formatTransactionDate(transaction.date)}
                  </p>
                </div>
                <div
                  className={cx(
                    "transactions-mobile-card__amount",
                    transaction.amount >= 0
                      ? "transactions-table__amount--positive"
                      : "transactions-table__amount--negative",
                  )}
                >
                  {formatTransactionAmount(transaction.amount)}
                </div>
              </div>

              <div className="transactions-mobile-card__body">
                <div>
                  <p className="transactions-mobile-card__label">Description</p>
                  <p className="transactions-mobile-card__description">
                    {transaction.description}
                  </p>
                </div>

                <div>
                  <p className="transactions-mobile-card__label">Category</p>
                  <TransactionCategorySelect
                    categories={categories}
                    disabled={categoryEditingDisabled}
                    isPending={isPending}
                    onChange={(nextCategory) =>
                      onCategoryChange(
                        transaction.id,
                        transaction.category,
                        nextCategory,
                      )
                    }
                    value={transaction.category}
                  />
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
