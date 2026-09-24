import * as React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils/cn';
import { BUTTON_ROLE_CLASS, type ButtonRole } from '@/lib/cms/buttons';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'danger'
  | 'subtle'
  | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-white shadow-sm hover:bg-brand/90 active:bg-brand/95',
  secondary:
    'bg-[rgb(var(--brand-secondary))] text-white shadow-sm hover:bg-[rgb(var(--brand-secondary))]/90',
  outline: 'border border-hairline bg-surface text-content hover:bg-muted/5',
  ghost: 'text-content hover:bg-muted/10',
  subtle: 'bg-muted/10 text-content hover:bg-muted/20',
  danger: 'bg-red-600 text-white shadow-sm hover:bg-red-700',
  link: 'text-brand underline underline-offset-4 hover:no-underline p-0 h-auto',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[0.8125rem] gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
};

/**
 * The Website Design role each variant takes: a primary call to action is the
 * Primary button, a secondary or outline one the Secondary button, and the
 * quiet variants belong to neither.
 */
export const VARIANT_ROLE: Record<ButtonVariant, ButtonRole | null> = {
  primary: 'primary',
  secondary: 'secondary',
  outline: 'secondary',
  ghost: null,
  subtle: null,
  danger: null,
  link: null,
};

/**
 * `role` names the Website Design role explicitly and wins over the variant's
 * — a main call to action drawn as an outline on a dark section is still the
 * Primary button. The role and size classes are markers only: without
 * `btn-tokens`, which only public buttons carry, they change nothing, so the
 * admin's buttons never take the website's design.
 */
export function buttonClasses(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  className?: string,
  role?: ButtonRole | null,
): string {
  const resolvedRole = role === undefined ? VARIANT_ROLE[variant] : role;
  return cn(
    'inline-flex items-center justify-center whitespace-nowrap rounded-lg font-medium transition-colors',
    'disabled:pointer-events-none disabled:opacity-50',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2',
    VARIANTS[variant],
    variant !== 'link' && SIZES[size],
    variant !== 'link' && `btn-${size}`,
    resolvedRole && BUTTON_ROLE_CLASS[resolvedRole],
    className,
  );
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  buttonRole?: ButtonRole | null;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', type = 'button', buttonRole, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClasses(variant, size, className, buttonRole)}
      {...props}
    />
  );
});

export interface ButtonLinkProps extends React.ComponentPropsWithoutRef<typeof Link> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function ButtonLink({ className, variant = 'primary', size = 'md', ...props }: ButtonLinkProps) {
  return <Link className={buttonClasses(variant, size, className)} {...props} />;
}
