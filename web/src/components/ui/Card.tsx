import type { HTMLAttributes, PropsWithChildren, ReactNode } from "react";

import { cx } from "@/lib/utils/cx";

type CardProps = PropsWithChildren<
  HTMLAttributes<HTMLDivElement> & {
    title?: ReactNode;
    description?: ReactNode;
    actions?: ReactNode;
  }
>;

export function Card({
  actions,
  children,
  className,
  description,
  title,
  ...props
}: CardProps) {
  return (
    <section className={cx("card", className)} {...props}>
      {(title || description || actions) && (
        <header className="card__header">
          <div>
            {title ? <h3 className="card__title">{title}</h3> : null}
            {description ? (
              <p className="card__description">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="card__actions">{actions}</div> : null}
        </header>
      )}
      <div className="card__body">{children}</div>
    </section>
  );
}
