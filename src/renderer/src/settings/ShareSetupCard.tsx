import { useState } from 'react'
import { Download, Upload } from 'lucide-react'
import { Button } from '@renderer/components/Button'
import { SectionCard } from '@renderer/components/Field'
import { Modal } from '@renderer/components/Modal'
import { useAction, useCanEdit } from '@renderer/lib/appContext'

/** SPEC.md 7: share the school's set-up as a .lockersettings file, with no student data. */
export function ShareSetupCard(): React.JSX.Element {
  const act = useAction()
  const canEdit = useCanEdit()
  const [confirm, setConfirm] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  return (
    <SectionCard
      title="Share your set-up"
      description="Save your words, code rules, lock settings, label sheets and layout, printer nudges, letter and its pictures in one settings file. It has no students, lockers, codes or history, so you can give it to another school, or keep it as a copy."
    >
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={() =>
            void act(async () => {
              const r = await window.api.exportSettings()
              if (r.ok) setDone(`Saved: ${r.path ?? ''}`)
              else if (!r.cancelled) throw new Error(r.message)
            })
          }
        >
          <Download size={16} aria-hidden /> Save a settings file…
        </Button>
        <Button variant="secondary" disabled={!canEdit} onClick={() => setConfirm(true)}>
          <Upload size={16} aria-hidden /> Use a settings file…
        </Button>
      </div>
      {done && <p className="mt-3 text-sm">{done}</p>}
      <Modal
        open={confirm}
        onOpenChange={setConfirm}
        title="Use a settings file?"
        description="Its words, code rules, lock settings, label layout, printer nudges and letter replace yours. Its pictures are added. Students, lockers and codes are not touched. You can undo it straight away with Ctrl+Z."
      >
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirm(false)}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              void act(async () => {
                setConfirm(false)
                const r = await window.api.importSettings()
                if (r.ok) setDone(`Settings from ${r.fromSchool ?? 'the file'} are now in use.`)
                else if (!r.cancelled) throw new Error(r.message)
              })
            }
          >
            Choose the file…
          </Button>
        </div>
      </Modal>
    </SectionCard>
  )
}
