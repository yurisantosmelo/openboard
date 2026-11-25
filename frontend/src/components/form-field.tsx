import { useId, type ComponentProps } from 'react';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

export interface FormFieldProps extends Omit<ComponentProps<typeof Input>, 'id'> {
  label: string;
  error?: string;
}

/** Composes shadcn/ui Field, FieldLabel and Input with accessible error wiring. */
export function FormField({ label, error, ...input }: FormFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
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
    </Field>
  );
}
