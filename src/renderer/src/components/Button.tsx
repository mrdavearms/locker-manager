import type { ButtonHTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@renderer/lib/cn'

const button = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed select-none',
  {
    variants: {
      variant: {
        primary: 'bg-brand text-white dark:text-canvas hover:bg-brand-strong',
        secondary: 'bg-surface border border-line text-ink hover:bg-surface-muted',
        ghost: 'text-brand hover:bg-brand-soft'
      },
      size: {
        md: 'h-10 px-4 text-sm',
        sm: 'h-8 px-3 text-sm'
      }
    },
    defaultVariants: { variant: 'primary', size: 'md' }
  }
)

type Props = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof button>

export function Button({
  className,
  variant,
  size,
  type = 'button',
  ...rest
}: Props): React.JSX.Element {
  return <button type={type} className={cn(button({ variant, size }), className)} {...rest} />
}
