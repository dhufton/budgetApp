import { forwardRef, type SelectHTMLAttributes } from "react";

import { cx } from "@/lib/utils/cx";

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, children, ...props }, ref) {
  return (
    <select ref={ref} className={cx("select", className)} {...props}>
      {children}
    </select>
  );
});
