import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'
import { cn } from '@renderer/lib/cn'

export const inputClass =
  'h-11 w-full rounded-xl border border-line-strong bg-surface px-3.5 text-[0.95rem] disabled:bg-surface-muted disabled:text-ink-muted'

export function Field({
  label,
  hint,
  children,
  htmlFor
}: {
  label: string
  hint?: string | undefined
  children: ReactNode
  htmlFor: string
}): React.JSX.Element {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-semibold">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </div>
  )
}

export function TextInput({
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement>): React.JSX.Element {
  return <input className={cn(inputClass, className)} {...rest} />
}

export function Select({
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>): React.JSX.Element {
  return (
    <select className={cn(inputClass, 'pr-8', className)} {...rest}>
      {children}
    </select>
  )
}

export function SectionCard({
  title,
  description,
  children,
  actions
}: {
  title: string
  description?: string
  children: ReactNode
  actions?: ReactNode
}): React.JSX.Element {
  return (
    <section className="card p-6 animate-rise">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{title}</h2>
          {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
        </div>
        {actions}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  )
}
