import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

import { cx } from "@/lib/utils/cx";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

type ButtonProps = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    fullWidth?: boolean;
  }
>;

export function Button({
  children,
  className,
  fullWidth = false,
  type = "button",
  variant = "primary",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cx(
        "button",
        `button--${variant}`,
        fullWidth && "button--full",
        className,
      )}
      type={type}
      {...props}
    >
      {children}
    </button>
  );
}
