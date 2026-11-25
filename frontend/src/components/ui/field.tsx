import { useId, type ComponentProps } from 'react';
import { Input } from './input';
import { Label } from './label';

export interface FieldProps extends Omit<ComponentProps<typeof Input>, 'id'> {
  label: string;
  error?: string;
}

/** Composes shadcn/ui Label and Input with accessible validation error wiring. */
export function Field({ label, error, ...input }: FieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        {...input}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
      />
      {error && (
        <span id={errorId} className="text-sm text-destructive">
          {error}
        </span>
      )}
    </div>
  );
}
