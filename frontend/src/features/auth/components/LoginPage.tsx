import { useState, type SubmitEvent } from 'react';
import { Navigate, useLocation } from 'react-router';
import { LoginForm } from '@/components/login-form';
import { ThemeToggle } from '@/components/theme-toggle';
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
    <main className="surface-grain relative flex min-h-svh w-full items-center justify-center bg-background p-6 md:p-10">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm">
        <LoginForm
          username={username}
          password={password}
          pending={signIn.isPending}
          error={signIn.isError ? errorMessage(signIn.error) : undefined}
          onUsernameChange={setUsername}
          onPasswordChange={setPassword}
          onSubmit={handleSubmit}
        />
      </div>
    </main>
  );
}
