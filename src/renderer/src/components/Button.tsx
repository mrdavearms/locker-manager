import type { ButtonHTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@renderer/lib/cn'

const button = cva(
  'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-[background-color,box-shadow,transform] duration-150 active:translate-y-px disabled:opacity-50 disabled:cursor-not-allowed disabled:active:translate-y-0 select-none whitespace-nowrap',
  {
    variants: {
      variant: {
        primary: 'bg-brand text-on-brand hover:bg-brand-strong shadow-[0_1px_0_rgb(0_0_0/0.15)]',
        accent:
          'bg-accent text-white dark:text-on-brand hover:brightness-95 shadow-[0_1px_0_rgb(0_0_0/0.15)]',
        secondary: 'bg-surface border border-line-strong text-ink hover:bg-surface-muted',
        ghost: 'text-brand hover:bg-brand-soft',
        danger: 'bg-bad text-white dark:text-on-brand hover:brightness-95'
      },
      size: {
        lg: 'h-12 px-5 text-base',
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
