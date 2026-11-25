import { AlertCircle } from 'lucide-react';
import { useId, type ComponentProps, type SubmitEvent } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface LoginFormProps extends Omit<ComponentProps<'div'>, 'onSubmit'> {
  username: string;
  password: string;
  pending?: boolean;
  error?: string;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: SubmitEvent<HTMLFormElement>) => void;
}

export function LoginForm({
  className,
  username,
  password,
  pending = false,
  error,
  onUsernameChange,
  onPasswordChange,
  onSubmit,
  ...props
}: LoginFormProps) {
  const usernameId = useId();
  const passwordId = useId();

  return (
    <div className={cn('flex flex-col gap-6', className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">
            <h1>Sign in</h1>
          </CardTitle>
          <CardDescription>Enter your username below to sign in to OpenBoard</CardDescription>
        </CardHeader>
        <CardContent>
          <form autoComplete="off" onSubmit={onSubmit}>
            <FieldGroup>
              {error && (
                <Alert variant="destructive">
                  <AlertCircle aria-hidden="true" />
                  <AlertDescription role="alert">{error}</AlertDescription>
                </Alert>
              )}
              <Field>
                <FieldLabel htmlFor={usernameId}>Username</FieldLabel>
                <Input
                  id={usernameId}
                  name="username"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  autoFocus
                  required
                  value={username}
                  onChange={(e) => {
                    onUsernameChange(e.target.value);
                  }}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={passwordId}>Password</FieldLabel>
                <Input
                  id={passwordId}
                  name="password"
                  type="password"
                  autoComplete="off"
                  required
                  value={password}
                  onChange={(e) => {
                    onPasswordChange(e.target.value);
                  }}
                />
              </Field>
              <Field>
                <Button type="submit" disabled={pending} aria-busy={pending || undefined}>
                  Sign in
                </Button>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
