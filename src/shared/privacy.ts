// Privacy settings for the open file (SPEC.md 7 item 12).

export interface PrivacyView {
  pinSet: boolean
  autoHideSeconds: number
  /** A PIN is needed before codes are shown. */
  required: boolean
  /** School IT requires a PIN on this computer. */
  managedRequires: boolean
  /** The PIN was entered in the last 10 minutes. */
  unlocked: boolean
}
