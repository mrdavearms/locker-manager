import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ScreenErrorBoundary } from '../../src/renderer/src/components/AppErrorBoundary'

// "Go to Home" did nothing on Home or the first screen: the screen did not change, so
// the error stayed. The panel is driven directly here; the project has no DOM tests.

type Props = ConstructorParameters<typeof ScreenErrorBoundary>[0]

function boundary(props: Partial<Props> = {}) {
  const b = new ScreenErrorBoundary({
    children: null,
    screenKey: 'home',
    onHome: vi.fn(),
    ...props
  })
  b.state = { message: 'SYNTHETIC failure' }
  b.setState = ((s: { message: string | null }) => {
    b.state = { ...b.state, ...s }
  }) as typeof b.setState
  return b
}

function findButton(node: ReactNode, label: string): ReactElement<{ onClick: () => void }> | null {
  if (!isValidElement(node)) return null
  const props = node.props as { children?: ReactNode; onClick?: () => void }
  if (props.children === label && props.onClick)
    return node as ReactElement<{ onClick: () => void }>
  const children = Array.isArray(props.children) ? props.children : [props.children]
  for (const c of children) {
    const found = findButton(c, label)
    if (found) return found
  }
  return null
}

describe('the screen error panel', () => {
  it('Go to Home clears the error even when Home is already the screen', () => {
    const onHome = vi.fn()
    const b = boundary({ onHome })
    findButton(b.render(), 'Go to Home')!.props.onClick()
    expect(onHome).toHaveBeenCalledOnce()
    expect(b.state.message).toBeNull()
  })

  it('clears the error when another screen is chosen', () => {
    const b = boundary({ screenKey: 'lockers:/SYNTHETIC/a.lockers' })
    b.componentDidUpdate({ ...b.props, screenKey: 'home:/SYNTHETIC/a.lockers' })
    expect(b.state.message).toBeNull()
  })
})
