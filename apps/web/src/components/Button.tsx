import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'success' | 'ghost';
export type ButtonSize = 'md' | 'sm';

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: '',
  secondary: 'btn-secondary',
  danger: 'btn-danger',
  success: 'btn-submit',
  ghost: 'btn-ghost',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
}

export function Button({ variant = 'primary', size = 'md', icon, className, children, ...rest }: ButtonProps) {
  const classes = [VARIANT_CLASS[variant], size === 'sm' ? 'btn-small' : '', icon ? 'btn-icon' : '', className]
    .filter(Boolean)
    .join(' ');
  return (
    <button className={classes} {...rest}>
      {icon}
      {children}
    </button>
  );
}
