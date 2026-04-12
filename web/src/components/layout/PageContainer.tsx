import type { PropsWithChildren } from "react";

import { cx } from "@/lib/utils/cx";

type PageContainerProps = PropsWithChildren<{
  narrow?: boolean;
  className?: string;
}>;

export function PageContainer({
  children,
  className,
  narrow = false,
}: PageContainerProps) {
  return (
    <div className={cx("page-container", narrow && "page-container--narrow", className)}>
      {children}
    </div>
  );
}
