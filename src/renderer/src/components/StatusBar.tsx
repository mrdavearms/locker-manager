import { Archive, Eye, FolderOpen, PencilLine, X } from 'lucide-react'
import type { OpenFileState } from '@renderer/lib/useFileState'
import { formatWhen } from '@renderer/lib/format'
import { cn } from '@renderer/lib/cn'
import { VersionLabel } from './VersionLabel'

interface Props {
  state: OpenFileState
  onBackups: () => void
  onClose: () => void
}

function saveText(s: OpenFileState): string {
  if (s.mode === 'read_only') return `Up to date as of ${formatWhen(s.openedAt)}`
  if (s.conflict && s.conflict.reason !== 'copy') return 'Not saved: sort out the conflict'
  if (s.saving) return 'Saving…'
  if (s.dirty) return 'Unsaved changes'
  return s.lastSavedAt ? `Saved ${formatWhen(s.lastSavedAt)}` : 'All changes saved'
}

const barButton = 'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 hover:bg-surface-muted'

/** One line along the bottom, like the label rail on a bank of lockers. */
export function StatusBar({ state, onBackups, onClose }: Props): React.JSX.Element {
  const editing = state.mode === 'edit'
  return (
    <footer
      data-testid="status-bar"
      className="sticky bottom-0 z-10 border-t border-line bg-surface/95 backdrop-blur"
    >
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-2.5 text-sm">
        <span
          data-testid="mode-pill"
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 font-semibold',
            editing ? 'bg-good-soft text-good' : 'bg-warn-soft text-warn'
          )}
        >
          {editing ? <PencilLine size={15} aria-hidden /> : <Eye size={15} aria-hidden />}
          {editing ? 'Editing' : 'Read-only'}
        </span>
        <span className="min-w-0 truncate font-semibold" title={state.path}>
          {state.fileName}
        </span>
        <span
          data-testid="save-status"
          className={cn('shrink-0 tabular-nums', state.dirty ? 'text-warn' : 'text-ink-muted')}
        >
          {saveText(state)}
        </span>
        <span className="hidden shrink-0 text-ink-muted tabular-nums lg:inline">
          {state.lastBackupAt ? `Last backup ${formatWhen(state.lastBackupAt)}` : 'No backups yet'}
        </span>
        <VersionLabel className="hidden shrink-0 text-xs text-ink-muted xl:inline" />
        <span className="ml-auto flex shrink-0 items-center gap-1">
          <button
            className={barButton}
            onClick={() => void window.api.showInFolder()}
            title={state.folder}
          >
            <FolderOpen size={16} aria-hidden /> Show in folder
          </button>
          <button className={barButton} onClick={onBackups}>
            <Archive size={16} aria-hidden /> Backups
          </button>
          <button className={barButton} onClick={onClose}>
            <X size={16} aria-hidden /> Close file
          </button>
        </span>
      </div>
    </footer>
  )
}
