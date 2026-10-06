import type { LetterBlock, LetterTemplate, Localised, ShowFor, Tone } from '@shared/letters'

// The letter a new school starts with (SPEC.md 5.2). It follows the layout that
// worked at the school the app was designed from: a heading band, a colour stripe,
// the name, locker and code panel, then short sections. The words avoid anything
// that dates ("this year's renovations"), and there is no footer or credit line:
// the school's name is the only sign-off.

const en = (s: string): Localised => ({ en: s })

function block(
  id: string,
  type: LetterBlock['type'],
  show: ShowFor,
  heading: string,
  body: string,
  tone: Tone = 'plain'
): LetterBlock {
  return {
    id,
    type,
    show,
    heading: en(heading),
    body: en(body),
    tone,
    imageId: null,
    imageSide: 'right',
    size: type === 'space' ? 6 : 60
  }
}

/**
 * The student panel keeps its four small labels as lines of `body`:
 * the word for locker, the label over the code, the label over a key number,
 * and the words shown when there is no school lock.
 */
export function studentPanelLabels(lockerWord: string): string {
  return [lockerWord, 'Your code', 'Your key number', 'Bring your own padlock'].join('\n')
}

export function defaultLetterTemplate(lockerWord = 'Locker'): LetterTemplate {
  return {
    pageSize: 'A4',
    languages: [{ code: 'en', name: 'English' }],
    usePreferredName: true,
    colour: 'colour',
    blocks: [
      block('header', 'header', 'all', 'Your locker', ''),
      block('stripe', 'stripe', 'all', '', ''),
      block('student', 'student', 'all', '', studentPanelLabels(lockerWord)),
      block(
        'know',
        'text',
        'code',
        'Know your lock',
        'Your locker opens with the code above. Turn each dial until your code lines up, then open the door.\n\nWhen you close the door, turn the dials so your code no longer shows.'
      ),
      block(
        'set',
        'text',
        'settable',
        'Set your code',
        'If the dials show **0 0 0 0** the first time you open your locker, the lock is waiting for your code. Set it to your code before you put anything inside, following the lock maker’s steps.\n\nIf you are not sure how, ask the {office} to help.'
      ),
      block(
        'fixed',
        'text',
        'fixed',
        'Your padlock',
        'Your padlock has its own code, shown above. It cannot be changed, so keep it to yourself.'
      ),
      block(
        'key',
        'text',
        'keyed',
        'Your key',
        'Your key number is {key_number}. Keep your key safe and never lend it to anyone.\n\nIf you lose your key, tell the {office} straight away.'
      ),
      block(
        'own',
        'text',
        'no_lock',
        'Your padlock',
        'This locker has no school lock. Bring your own padlock, and keep its key or code to yourself.'
      ),
      block(
        'daily',
        'text',
        'all',
        'Every day',
        '- Lock your locker every time you close it.\n- Keep money, phones and other valuables with you.\n- Keep food in sealed containers.\n- Tell the {office} if your locker is damaged.',
        'panel'
      ),
      block(
        'secret',
        'text',
        'code',
        'Keep your code secret',
        '- Never tell anyone your code, not even friends.\n- If someone else learns your code, ask the {office} for a new one.\n- If you forget your code, see your {leader} or the {office}.'
      ),
      block('help', 'text', 'all', 'Need help?', 'See your {leader} or the {office}.', 'help')
    ]
  }
}
