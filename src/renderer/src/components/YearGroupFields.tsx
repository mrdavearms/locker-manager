import { useState } from 'react'
import { useTerms } from '@renderer/lib/appContext'
import { useRpc } from '@renderer/lib/rpc'
import { Field, Select, TextInput } from './Field'

const OTHER = '__other'

/**
 * A year level and a group chosen from what the file already has, with "Other…" for a
 * year level nobody has yet. `year` is the plain number ("7"), `group` the export code ("07A").
 */
export function YearGroupFields({
  idPrefix,
  year,
  group,
  onYear,
  onGroup,
  disabled = false
}: {
  idPrefix: string
  year: string
  group: string
  onYear: (v: string) => void
  onGroup: (v: string) => void
  disabled?: boolean
}): React.JSX.Element {
  const terms = useTerms()
  const { data: groups } = useRpc('groups.list', {})
  // Year levels in use by current students too, so a school with no groups still gets a list.
  const { data: students } = useRpc('students.list', { filter: 'current' })
  const [otherMode, setOtherMode] = useState(false)
  const years = [
    ...new Set(
      [
        ...(groups ?? []).map((g) => g.yearLevel),
        ...(students ?? []).map((s) => s.yearLevel)
      ].filter((y): y is string => y !== null && y !== '')
    )
  ].sort((a, b) => Number(a) - Number(b) || a.localeCompare(b))
  const isOther =
    otherMode ||
    (year !== '' && groups !== undefined && students !== undefined && !years.includes(year))
  const yearWord = terms.yearLevel.one
  const groupWord = terms.group.one
  const known = (groups ?? []).some((g) => g.code === group)
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={yearWord} htmlFor={`${idPrefix}-year`}>
        <Select
          id={`${idPrefix}-year`}
          disabled={disabled}
          value={isOther ? OTHER : year}
          onChange={(e) => {
            if (e.target.value === OTHER) {
              setOtherMode(true)
              onYear('')
            } else {
              setOtherMode(false)
              onYear(e.target.value)
            }
          }}
        >
          <option value="">Not set</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {yearWord} {y}
            </option>
          ))}
          <option value={OTHER}>Other…</option>
        </Select>
        {isOther && (
          <TextInput
            className="mt-2"
            aria-label={`Other ${yearWord.toLowerCase()}`}
            disabled={disabled}
            value={year}
            maxLength={20}
            onChange={(e) => onYear(e.target.value)}
          />
        )}
      </Field>
      <Field label={groupWord} htmlFor={`${idPrefix}-group`}>
        <Select
          id={`${idPrefix}-group`}
          disabled={disabled}
          value={group}
          onChange={(e) => onGroup(e.target.value)}
        >
          <option value="">None</option>
          {group !== '' && !known && <option value={group}>{group}</option>}
          {(groups ?? []).map((g) => (
            <option key={g.code} value={g.code}>
              {g.display}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  )
}
