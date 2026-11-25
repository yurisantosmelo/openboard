import { AlertCircle } from 'lucide-react';
import { useState, type SubmitEvent } from 'react';
import { Navigate, useLocation } from 'react-router';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { errorMessage } from '../../../shared/api/httpClient';
import { useCurrentUser, useSignIn } from '../hooks/useAuth';
import { CHANGE_PASSWORD_PATH, type SignInState } from '../paths';

export function LoginPage() {
  const { data: user } = useCurrentUser();
  const signIn = useSignIn();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  if (user) {
    const from = (location.state as SignInState | null)?.from ?? '/';
    return <Navigate to={user.mustChangePassword ? CHANGE_PASSWORD_PATH : from} replace />;
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    signIn.mutate({ username, password });
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-center text-2xl font-semibold tracking-tight">OpenBoard</h1>
      <Card>
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={handleSubmit}>
            {signIn.isError && (
              <Alert variant="destructive">
                <AlertCircle aria-hidden="true" />
                <AlertDescription role="alert">{errorMessage(signIn.error)}</AlertDescription>
              </Alert>
            )}
            <Field
              label="Username"
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
              }}
            />
            <Field
              label="Password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
              }}
            />
            <Button
              type="submit"
              disabled={signIn.isPending}
              aria-busy={signIn.isPending || undefined}
            >
              Sign in
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
