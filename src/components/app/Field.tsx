import { useId, type ComponentProps } from 'react'
import { Input } from '@/components/ui/input'

export function Field({
  label,
  hint,
  ...props
}: { label: string; hint?: string } & ComponentProps<typeof Input>) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[0.95rem] font-medium">
        {label}
      </label>
      <Input id={id} aria-describedby={hint ? `${id}-hint` : undefined} {...props} />
      {hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
