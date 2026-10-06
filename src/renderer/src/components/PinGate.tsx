import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { KeyRound } from 'lucide-react'
import { Button } from './Button'
import { TextInput } from './Field'
import { Modal } from './Modal'

// SPEC.md 7 item 12: when the school sets a PIN, codes are shown or printed only
// after it is entered on this computer (it then lasts 10 minutes).

type Ensure = () => Promise<boolean>
const Ctx = createContext<Ensure>(async () => true)

/** Resolves true when codes may be shown now, asking for the PIN if needed. */
export const useCodeGate = (): Ensure => useContext(Ctx)

function PinForm({ onDone }: { onDone: (ok: boolean) => void }): React.JSX.Element {
  const [pin, setPin] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const submit = async (): Promise<void> => {
    const r = await window.api.rpc('privacy.unlock', { pin })
    if (r.ok) onDone(true)
    else {
      setProblem(r.message)
      setPin('')
    }
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <TextInput
        autoFocus
        type="password"
        inputMode="numeric"
        autoComplete="off"
        aria-label="PIN"
        maxLength={8}
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
        data-testid="pin-input"
      />
      {problem && (
        <p className="mt-2 text-sm text-bad" role="alert">
          {problem}
        </p>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={() => onDone(false)}>
          Cancel
        </Button>
        <Button type="submit" disabled={pin.length < 4} data-testid="pin-submit">
          <KeyRound size={16} aria-hidden /> Unlock codes
        </Button>
      </div>
    </form>
  )
}

export function PinGateProvider({
  showError,
  children
}: {
  showError: (m: string) => void
  children: ReactNode
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const resolver = useRef<((ok: boolean) => void) | null>(null)
  const ensure = useCallback<Ensure>(async () => {
    const r = await window.api.rpc('privacy.get', {})
    if (!r.ok) return true
    const v = r.value
    if (v.managedRequires && !v.pinSet) {
      showError('Your IT team requires a PIN before codes are shown. Set one in Settings, Privacy.')
      return false
    }
    if (!v.required || v.unlocked) return true
    setOpen(true)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
  }, [showError])
  const done = (ok: boolean): void => {
    setOpen(false)
    resolver.current?.(ok)
    resolver.current = null
  }
  return (
    <Ctx.Provider value={ensure}>
      {children}
      <Modal
        open={open}
        onOpenChange={(o) => !o && done(false)}
        title="Enter the PIN"
        description="Codes are protected by a PIN on this file. After the PIN, codes can be shown for 10 minutes on this computer."
        testId="pin-dialog"
      >
        <PinForm onDone={done} />
      </Modal>
    </Ctx.Provider>
  )
}
