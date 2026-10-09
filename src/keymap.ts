export const commands = [
  { id: 'select', label: 'Select', group: 'Tools', keys: ['1', 'v'] },
  { id: 'draw', label: 'Pen', group: 'Tools', keys: ['2', 'p', 'b'] },
  { id: 'eraser', label: 'Eraser', group: 'Tools', keys: ['3'] },
  { id: 'text', label: 'Text', group: 'Tools', keys: ['4', 't'] },
  { id: 'hand', label: 'Hand', group: 'Tools', keys: ['5', 'h'] },
  { id: 'pan', label: 'Pan · hold and drag', group: 'Navigation', keys: ['space'] },
  {
    id: 'zoomIn',
    label: 'Zoom in · hold',
    group: 'Navigation',
    keys: ['e', 'equal', 'shift+equal', 'mod+equal', 'mod+shift+equal'],
  },
  {
    id: 'zoomOut',
    label: 'Zoom out · hold',
    group: 'Navigation',
    keys: ['q', 'minus', 'shift+minus', 'mod+minus'],
  },
  { id: 'zoomFit', label: 'Fit drawing', group: 'Navigation', keys: ['z', 'shift+1'] },
  { id: 'zoomSelection', label: 'Fit selection', group: 'Navigation', keys: ['shift+2'] },
  {
    id: 'zoomReset',
    label: 'Actual size · 100%',
    group: 'Navigation',
    keys: ['r', 'shift+0', 'mod+0'],
  },
  { id: 'colorPrev', label: 'Previous colour', group: 'Ink', keys: ['a', 'comma'] },
  { id: 'colorNext', label: 'Next colour', group: 'Ink', keys: ['d', 'period'] },
  { id: 'widthDown', label: 'Thinner stroke', group: 'Ink', keys: ['s', 'bracketleft'] },
  { id: 'widthUp', label: 'Thicker stroke', group: 'Ink', keys: ['w', 'bracketright'] },
  { id: 'opacityDown', label: 'Lower opacity', group: 'Ink', keys: ['f', 'shift+bracketleft'] },
  { id: 'opacityUp', label: 'Higher opacity', group: 'Ink', keys: ['g', 'shift+bracketright'] },
  { id: 'palette', label: 'Open / close ink controls', group: 'Ink', keys: ['6', 'i'] },
  { id: 'undo', label: 'Undo', group: 'Editing', keys: ['mod+z'] },
  { id: 'redo', label: 'Redo', group: 'Editing', keys: ['mod+shift+z', 'mod+y'] },
  { id: 'delete', label: 'Delete selection', group: 'Editing', keys: ['delete', 'backspace'] },
  { id: 'duplicate', label: 'Duplicate selection', group: 'Editing', keys: ['mod+d'] },
  { id: 'selectAll', label: 'Select all', group: 'Editing', keys: ['mod+a'] },
  { id: 'boards', label: 'Switch boards', group: 'Workspace', keys: ['mod+k'] },
  { id: 'newBoard', label: 'New board', group: 'Workspace', keys: ['mod+alt+n'] },
  { id: 'save', label: 'Save now', group: 'Workspace', keys: ['mod+s'] },
  { id: 'settings', label: 'Preferences', group: 'Workspace', keys: ['mod+comma'] },
  { id: 'shortcuts', label: 'Edit shortcuts', group: 'Workspace', keys: ['slash', 'shift+slash'] },
  { id: 'focus', label: 'Hide / show controls', group: 'Workspace', keys: ['mod+period'] },
  { id: 'fullscreen', label: 'Fullscreen', group: 'Workspace', keys: ['alt+enter'] },
] as const
export type Command = (typeof commands)[number]['id']
export type Keymap = Record<Command, string[]>
export const defaultKeymap = (): Keymap =>
  Object.fromEntries(commands.map((c) => [c.id, [...c.keys]])) as Keymap
export function readKeymap(): Keymap {
  const fallback = defaultKeymap()
  try {
    const stored = JSON.parse(localStorage.getItem('folio-keymap-v3') || '{}')
    for (const command of commands) {
      const keys = stored[command.id]
      if (Array.isArray(keys) && keys.every((k) => typeof k === 'string' && k.length < 60))
        fallback[command.id] = keys.slice(0, 6)
    }
  } catch {
    /* An unavailable preference store never blocks opening a board. */
  }
  return fallback
}
const keyNames: Record<string, string> = {
  ' ': 'space',
  '=': 'equal',
  '+': 'equal',
  '-': 'minus',
  _: 'minus',
  '[': 'bracketleft',
  '{': 'bracketleft',
  ']': 'bracketright',
  '}': 'bracketright',
  ',': 'comma',
  '<': 'comma',
  '.': 'period',
  '>': 'period',
  '/': 'slash',
  '?': 'slash',
  '`': 'backquote',
  '~': 'backquote',
  '\\': 'backslash',
  '|': 'backslash',
  ';': 'semicolon',
  ':': 'semicolon',
  "'": 'quote',
  '"': 'quote',
}
export function chordFromEvent(
  event: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>,
): string | null {
  let key = event.key.toLowerCase()
  if (['control', 'meta', 'shift', 'alt', 'altgraph', 'dead', 'unidentified'].includes(key))
    return null
  if (event.shiftKey && /^Digit\d$/.test(event.code)) key = event.code.slice(-1)
  else key = keyNames[key] || key
  return [
    event.ctrlKey || event.metaKey ? 'mod' : '',
    event.altKey ? 'alt' : '',
    event.shiftKey ? 'shift' : '',
    key,
  ]
    .filter(Boolean)
    .join('+')
}
export function bindingLabel(
  chord?: string,
  mac = /Mac|iPhone|iPad/.test(navigator.platform),
): string {
  if (!chord) return 'Unassigned'
  const labels: Record<string, string> = {
    mod: mac ? '⌘' : 'Ctrl',
    shift: 'Shift',
    alt: mac ? 'Option' : 'Alt',
    space: 'Space',
    equal: '=',
    minus: '−',
    bracketleft: '[',
    bracketright: ']',
    comma: ',',
    period: '.',
    slash: '/',
    backquote: '`',
    backslash: '\\',
    semicolon: ';',
    quote: "'",
    arrowup: '↑',
    arrowdown: '↓',
    arrowleft: '←',
    arrowright: '→',
  }
  return chord
    .split('+')
    .map((k) => labels[k] || k.charAt(0).toUpperCase() + k.slice(1))
    .join(' + ')
}
export function bindingProblem(chord: string, command: Command, map: Keymap): string | null {
  const key = chord.split('+').at(-1)
  if (['escape', 'tab'].includes(key!))
    return 'Escape and Tab stay available for keyboard navigation.'
  if (chord.startsWith('mod+') && ['l', 'r', 'w', 't', 'n', 'c', 'x', 'v'].includes(key!))
    return 'This combination is reserved for the browser or clipboard.'
  if (['f5', 'f11', 'f12'].includes(key!) || chord === 'alt+f4')
    return 'This combination is managed by your browser or operating system.'
  const conflict = commands.find((c) => c.id !== command && map[c.id].includes(chord))
  return conflict
    ? `Already assigned to ${conflict.label.toLowerCase()}. Change that binding first.`
    : null
}
