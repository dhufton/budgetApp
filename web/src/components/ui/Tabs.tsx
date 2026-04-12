import { cx } from "@/lib/utils/cx";

export type TabItem<T extends string> = {
  value: T;
  label: string;
};

type TabsProps<T extends string> = {
  ariaLabel: string;
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
};

export function Tabs<T extends string>({
  ariaLabel,
  items,
  onChange,
  value,
}: TabsProps<T>) {
  return (
    <div aria-label={ariaLabel} className="tabs" role="tablist">
      {items.map((item) => {
        const isActive = item.value === value;

        return (
          <button
            aria-selected={isActive}
            className={cx("tabs__trigger", isActive && "tabs__trigger--active")}
            key={item.value}
            onClick={() => onChange(item.value)}
            role="tab"
            type="button"
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
