import { describe, expect, it } from 'vitest'
import { bindingLabel, bindingProblem, chordFromEvent, defaultKeymap } from '../src/keymap'
const event = (key: string, code: string, modifiers: Partial<KeyboardEvent> = {}) => ({
  key,
  code,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...modifiers,
})
describe('editable shortcut matching', () => {
  it('keeps Windows and Mac primary modifiers portable', () => {
    expect(chordFromEvent(event('Z', 'KeyZ', { ctrlKey: true, shiftKey: true }))).toBe(
      'mod+shift+z',
    )
    expect(chordFromEvent(event('Z', 'KeyZ', { metaKey: true, shiftKey: true }))).toBe(
      'mod+shift+z',
    )
    expect(bindingLabel('mod+shift+z', true)).toBe('⌘ + Shift + Z')
  })
  it('normalizes shifted punctuation and British digit keys', () => {
    expect(chordFromEvent(event('{', 'BracketLeft', { shiftKey: true }))).toBe('shift+bracketleft')
    expect(chordFromEvent(event('"', 'Digit2', { shiftKey: true }))).toBe('shift+2')
    expect(chordFromEvent(event('+', 'Equal', { shiftKey: true }))).toBe('shift+equal')
    expect(chordFromEvent(event('q', 'KeyA'))).toBe('q')
  })
  it('rejects ambiguous actions and protects browser, clipboard, and focus keys', () => {
    const map = defaultKeymap()
    expect(bindingProblem('e', 'draw', map)).toContain('zoom in')
    expect(bindingProblem('tab', 'draw', map)).toContain('navigation')
    expect(bindingProblem('mod+c', 'draw', map)).toContain('clipboard')
    expect(bindingProblem('j', 'draw', map)).toBe(null)
    const bindings = Object.values(map).flat()
    expect(new Set(bindings).size).toBe(bindings.length)
  })
})
