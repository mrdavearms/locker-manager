import { BrowserWindow } from 'electron'
import log from 'electron-log/main'
import { brand } from '@shared/brand'
import { channels } from '@shared/channels'
import { fileSession } from './fileService'

// Label QR codes (SPEC.md 5.6) carry lockermanager://locker/<short id>, never a
// name or code. Scanning one on a computer with the app opens that locker.

export function lockerIdFromLink(url: string): string | null {
  const m = new RegExp(`^${brand.protocol}://locker/([A-Za-z0-9_-]{4,64})/?$`).exec(url.trim())
  return m ? m[1]! : null
}

export function openLockerLink(url: string): void {
  const win = BrowserWindow.getAllWindows()[0]
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
  const qrId = lockerIdFromLink(url)
  if (!qrId || !win) return
  const s = fileSession()
  if (!s.isOpen) {
    win.webContents.send(channels.openLocker, {
      lockerId: null,
      message: 'Open your school’s file first, then scan the label again.'
    })
    return
  }
  const row = s.read((db) =>
    db.get<{ id: string }>('SELECT id FROM locker WHERE qr_id = $q AND archived_at IS NULL', {
      $q: qrId
    })
  )
  log.info('locker link opened', { found: !!row })
  win.webContents.send(
    channels.openLocker,
    row
      ? { lockerId: row.id, message: null }
      : { lockerId: null, message: 'That label is not for a locker in the file that is open.' }
  )
}
