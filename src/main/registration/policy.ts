import type { KeyObject } from 'node:crypto'
import type { RegistrationDetails } from '@shared/registration'
import { checkKey, cleanKeyText } from './keyFormat'

export type RegistrationSource = 'computer' | 'it' | 'file'

export type RegistrationStatus =
  | { state: 'registered'; details: RegistrationDetails; source: RegistrationSource; key: string }
  | { state: 'unregistered' }

export interface PolicyInput {
  computerKey: string | null
  itKey: string | null
  fileKey: string | null
  publicKeys: KeyObject[]
  now: Date
}

function validDetails(
  text: string | null,
  publicKeys: KeyObject[],
  now: Date
): RegistrationDetails | null {
  if (!text) return null
  const check = checkKey(text, publicKeys, now)
  return check.ok ? check.details : null
}

/** Decides whether this copy is registered. Keys are tried in order: IT, this computer, the open file. */
export function registrationStatus(input: PolicyInput): RegistrationStatus {
  const sources: [RegistrationSource, string | null][] = [
    ['it', input.itKey],
    ['computer', input.computerKey],
    ['file', input.fileKey]
  ]
  for (const [source, text] of sources) {
    const details = validDetails(text, input.publicKeys, input.now)
    if (details && text) return { state: 'registered', details, source, key: cleanKeyText(text) }
  }
  return { state: 'unregistered' }
}

/** Which key to copy where after a file opens. A valid key is never replaced. */
export function keysAfterOpen(input: {
  fileKey: string | null
  computerKey: string | null
  itKey: string | null
  mode: 'edit' | 'read_only'
  publicKeys: KeyObject[]
  now: Date
}): { saveToComputer: string | null; writeToFile: string | null } {
  const { publicKeys, now } = input
  const fileValid = validDetails(input.fileKey, publicKeys, now) !== null
  const computerValid = validDetails(input.computerKey, publicKeys, now) !== null
  const itValid = validDetails(input.itKey, publicKeys, now) !== null

  const saveToComputer =
    fileValid && !computerValid && input.fileKey ? cleanKeyText(input.fileKey) : null

  let writeToFile: string | null = null
  if (input.mode === 'edit' && !fileValid) {
    if (computerValid && input.computerKey) writeToFile = cleanKeyText(input.computerKey)
    else if (itValid && input.itKey) writeToFile = cleanKeyText(input.itKey)
  }
  return { saveToComputer, writeToFile }
}
