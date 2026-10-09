import * as SelectPrimitive from '@radix-ui/react-select'
import { Check, ChevronDown, ChevronUp } from 'lucide-react'
import type { ReactNode } from 'react'

export interface SelectOption {
  value: string
  label: string
  icon?: ReactNode
  group?: string
  disabled?: boolean
}

/** Shared, keyboard-accessible select for the library, canvas and preferences. */
export function Select({
  label,
  value,
  onChange,
  options,
  icon,
  compact,
  onClose,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  icon?: ReactNode
  compact?: boolean
  onClose?: () => void
}) {
  const groups = [...new Set(options.map((option) => option.group))]
  return (
    <SelectPrimitive.Root value={value} onValueChange={onChange}>
      <SelectPrimitive.Trigger
        className={'select-trigger' + (compact ? ' compact' : '')}
        aria-label={label}
        title={
          compact
            ? label + ' · ' + options.find((option) => option.value === value)?.label
            : undefined
        }
        data-app-ui
      >
        {icon}
        <span className="select-value">
          <SelectPrimitive.Value />
        </span>
        <SelectPrimitive.Icon>
          <ChevronDown size={13} />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          className="select-content"
          position="popper"
          sideOffset={7}
          collisionPadding={12}
          data-app-ui
          onCloseAutoFocus={
            onClose
              ? (event) => {
                  event.preventDefault()
                  onClose()
                }
              : undefined
          }
        >
          <SelectPrimitive.ScrollUpButton className="select-scroll">
            <ChevronUp size={13} />
          </SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport className="select-viewport">
            {groups.map((group, index) => (
              <SelectPrimitive.Group key={group ?? 'options'}>
                {index > 0 && <SelectPrimitive.Separator className="select-separator" />}
                {group && (
                  <SelectPrimitive.Label className="select-label">{group}</SelectPrimitive.Label>
                )}
                {options
                  .filter((option) => option.group === group)
                  .map((option) => (
                    <SelectPrimitive.Item
                      key={option.value}
                      value={option.value}
                      disabled={option.disabled}
                      textValue={option.label}
                      className="select-option"
                    >
                      {option.icon}
                      <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                      <SelectPrimitive.ItemIndicator className="select-check">
                        <Check size={14} />
                      </SelectPrimitive.ItemIndicator>
                    </SelectPrimitive.Item>
                  ))}
              </SelectPrimitive.Group>
            ))}
          </SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className="select-scroll">
            <ChevronDown size={13} />
          </SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}
