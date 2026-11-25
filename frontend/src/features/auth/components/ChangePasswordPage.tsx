import { AlertCircle, Info } from 'lucide-react';
import { useState, type SubmitEvent } from 'react';
import { useNavigate } from 'react-router';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { ApiError, errorMessage } from '../../../shared/api/httpClient';
import { useChangePassword, useCurrentUser } from '../hooks/useAuth';

type FieldMessages = Partial<Record<'current_password' | 'new_password', string>>;

/** Field errors from a validation-error problem, or null for any other failure. */
function fieldMessagesOf(error: unknown): FieldMessages | null {
  if (!(error instanceof ApiError) || error.status !== 422) {
    return null;
  }
  const messages: FieldMessages = {};
  for (const { field, message } of error.problem?.errors ?? []) {
    if (field === 'current_password' || field === 'new_password') {
      messages[field] = message;
    }
  }
  return messages;
}

export function ChangePasswordPage() {
  const { data: user } = useCurrentUser();
  const change = useChangePassword();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [mismatch, setMismatch] = useState(false);

  const fieldMessages = change.isError ? fieldMessagesOf(change.error) : null;

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const confirmed = newPassword === confirmation;
    setMismatch(!confirmed);
    if (!confirmed) {
      return;
    }
    change.mutate(
      { currentPassword, newPassword },
      {
        onSuccess: () => {
          void navigate('/', { replace: true });
        },
      },
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={handleSubmit}>
            {user?.mustChangePassword && (
              <Alert>
                <Info aria-hidden="true" />
                <AlertDescription role="status">
                  You signed in with a Temporary Password. Choose a new password to continue.
                </AlertDescription>
              </Alert>
            )}
            {change.isError && !fieldMessages && (
              <Alert variant="destructive">
                <AlertCircle aria-hidden="true" />
                <AlertDescription role="alert">{errorMessage(change.error)}</AlertDescription>
              </Alert>
            )}
            <Field
              label="Current password"
              name="current-password"
              type="password"
              autoComplete="current-password"
              required
              value={currentPassword}
              error={fieldMessages?.current_password}
              onChange={(e) => {
                setCurrentPassword(e.target.value);
              }}
            />
            <Field
              label="New password"
              name="new-password"
              type="password"
              autoComplete="new-password"
              required
              value={newPassword}
              error={fieldMessages?.new_password}
              onChange={(e) => {
                setNewPassword(e.target.value);
              }}
            />
            <p className="text-xs text-muted-foreground">
              Use 12 to 128 characters. A long passphrase works well.
            </p>
            <Field
              label="Confirm new password"
              name="confirm-password"
              type="password"
              autoComplete="new-password"
              required
              value={confirmation}
              error={mismatch ? 'The passwords do not match.' : undefined}
              onChange={(e) => {
                setConfirmation(e.target.value);
              }}
            />
            <Button
              type="submit"
              disabled={change.isPending}
              aria-busy={change.isPending || undefined}
            >
              Change password
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
