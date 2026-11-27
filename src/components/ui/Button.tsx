import type { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

// Thick bottom border makes the button look pressable; it flattens when pressed.
const BASE =
  'inline-flex items-center justify-center gap-2 rounded-control border-b-4 font-bold select-none ' +
  'transition-[transform,filter] duration-100 active:translate-y-0.5 active:border-b-2 ' +
  'disabled:cursor-not-allowed disabled:translate-y-0 disabled:border-b-4 disabled:border-edge-deep ' +
  'disabled:bg-edge disabled:text-muted disabled:brightness-100';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'border-primary-deep bg-primary text-white hover:brightness-110',
  secondary: 'border-2 border-b-4 border-edge-deep bg-surface text-ink hover:bg-canvas',
  ghost: 'border-transparent bg-transparent text-primary-ink hover:bg-primary-soft',
  danger: 'border-danger-deep bg-danger text-white hover:brightness-110',
};

const SIZES: Record<ButtonSize, string> = {
  md: 'min-h-11 px-5 py-2 text-base',
  lg: 'min-h-14 px-6 py-3 text-lg',
};

/** Class names of a button, for links that must look like one. */
export function buttonClasses(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', className?: string): string {
  return [BASE, VARIANTS[variant], SIZES[size], className].filter(Boolean).join(' ');
}

export function Button({ variant = 'primary', size = 'md', type = 'button', className, ...rest }: ButtonProps) {
  return <button type={type} className={buttonClasses(variant, size, className)} {...rest} />;
}
