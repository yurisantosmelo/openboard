import { AlertCircle, Loader2 } from 'lucide-react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { errorMessage } from '../../../shared/api/httpClient';
import { useCurrentUser } from '../hooks/useAuth';
import { CHANGE_PASSWORD_PATH, SIGN_IN_PATH, type SignInState } from '../paths';

/**
 * Renders the child routes only for a signed-in User. Signed-out visitors go
 * to sign-in; a pending Temporary Password sends the User to change it first.
 */
export function RequireAuth() {
  const { data: user, isPending, isError, error } = useCurrentUser();
  const location = useLocation();

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading…
        </p>
      </div>
    );
  }
  if (isError) {
    return (
      <div className="mx-auto max-w-md p-6">
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertDescription role="alert">{errorMessage(error)}</AlertDescription>
        </Alert>
      </div>
    );
  }
  if (!user) {
    const state: SignInState = { from: location.pathname };
    return <Navigate to={SIGN_IN_PATH} replace state={state} />;
  }
  if (user.mustChangePassword && location.pathname !== CHANGE_PASSWORD_PATH) {
    return <Navigate to={CHANGE_PASSWORD_PATH} replace />;
  }
  return <Outlet />;
}
