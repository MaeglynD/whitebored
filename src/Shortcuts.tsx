import { useEffect, useState } from 'react'
import { RotateCcw, X, Plus, Keyboard } from 'lucide-react'
import {
  bindingLabel,
  bindingProblem,
  chordFromEvent,
  commands,
  defaultKeymap,
  type Command,
  type Keymap,
} from './keymap'

export function Shortcuts({ value, onChange }: { value: Keymap; onChange: (map: Keymap) => void }) {
  const [recording, setRecording] = useState<{ id: Command; index: number } | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!recording) return
    const capture = (event: KeyboardEvent) => {
      if (event.isComposing || event.repeat) return
      if (event.key === 'Tab') {
        setRecording(null)
        return
      }
      event.preventDefault()
      event.stopImmediatePropagation()
      if (event.key === 'Escape') {
        setRecording(null)
        setError('')
        return
      }
      const chord = chordFromEvent(event)
      if (!chord) return
      const issue = bindingProblem(chord, recording.id, value)
      if (issue) {
        setError(issue)
        return
      }
      const keys = [...value[recording.id]]
      keys[recording.index] = chord
      onChange({ ...value, [recording.id]: [...new Set(keys)] })
      setRecording(null)
      setError('')
    }
    window.addEventListener('keydown', capture, true)
    return () => window.removeEventListener('keydown', capture, true)
  }, [recording, value, onChange])
  return (
    <div className="shortcut-editor">
      <div className="shortcut-intro">
        <Keyboard size={17} />
        <span>Click a key to change it. Press Escape to cancel.</span>
        <button
          className="text-button"
          onClick={() => {
            onChange(defaultKeymap())
            setRecording(null)
            setError('')
          }}
        >
          <RotateCcw size={13} /> Reset all
        </button>
      </div>
      {error && (
        <p className="binding-error" role="alert">
          {error}
        </p>
      )}
      <div className="shortcut-scroll">
        {[...new Set(commands.map((c) => c.group))].map((group) => (
          <section key={group} className="shortcut-group">
            <h3>{group}</h3>
            {commands
              .filter((c) => c.group === group)
              .map((c) => (
                <div className="shortcut-row" key={c.id}>
                  <span>{c.label}</span>
                  <div className="binding-slots">
                    {value[c.id].map((key, index) => (
                      <span className="binding-slot" key={index}>
                        <button
                          className={
                            'binding-key' +
                            (recording?.id === c.id && recording.index === index
                              ? ' recording'
                              : '')
                          }
                          aria-label={`Change ${c.label.toLowerCase()} shortcut ${index + 1}`}
                          onClick={() => {
                            setRecording({ id: c.id, index })
                            setError('')
                          }}
                        >
                          {recording?.id === c.id && recording.index === index
                            ? 'Press a key…'
                            : bindingLabel(key)}
                        </button>
                        <button
                          className="remove-binding"
                          aria-label={`Remove ${c.label.toLowerCase()} shortcut ${index + 1}`}
                          onClick={() =>
                            onChange({
                              ...value,
                              [c.id]: value[c.id].filter((_, i) => i !== index),
                            })
                          }
                        >
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                    {value[c.id].length < 6 && (
                      <button
                        className={
                          'add-binding' +
                          (recording?.id === c.id && recording.index === value[c.id].length
                            ? ' recording'
                            : '')
                        }
                        aria-label={`Add ${c.label.toLowerCase()} shortcut`}
                        onClick={() => {
                          setRecording({ id: c.id, index: value[c.id].length })
                          setError('')
                        }}
                      >
                        {recording?.id === c.id && recording.index === value[c.id].length ? (
                          'Press a key…'
                        ) : (
                          <Plus size={12} />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              ))}
          </section>
        ))}
      </div>
      <p className="shortcut-footer">
        Pinch to zoom · Middle-drag to pan · Shift to constrain · Double-click text to edit.
        Shortcuts pause while you type.
      </p>
    </div>
  )
}
