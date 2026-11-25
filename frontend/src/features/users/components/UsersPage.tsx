import { AlertCircle, Info, KeyRound, Loader2, UserCheck, UserX } from 'lucide-react';
import { useId, useState } from 'react';
import { Navigate } from 'react-router';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { errorMessage } from '../../../shared/api/httpClient';
import { useCurrentUser } from '../../auth';
import type { AdminUser, UserPage } from '../api/usersApi';
import {
  useDeactivateUser,
  useIssueTemporaryPassword,
  useReactivateUser,
  useUsers,
} from '../hooks/useUsers';

interface TemporaryPasswordBannerProps {
  username: string;
  password: string;
  onDismiss: () => void;
}

function TemporaryPasswordBanner({ username, password, onDismiss }: TemporaryPasswordBannerProps) {
  return (
    <div className="grid gap-3 border-b p-6">
      <Alert>
        <Info aria-hidden="true" />
        <AlertDescription role="status">
          <p className="m-0 break-words">
            New Temporary Password for <strong>{username}</strong>:{' '}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">{password}</code>.
            Share it now — it will not be shown again.
          </p>
        </AlertDescription>
      </Alert>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}

interface UserRowProps {
  user: AdminUser;
  isSelf: boolean;
  busy: boolean;
  onDeactivate: (userId: string) => void;
  onReactivate: (userId: string) => void;
  onIssueTemporaryPassword: (userId: string) => void;
}

function UserRow({
  user,
  isSelf,
  busy,
  onDeactivate,
  onReactivate,
  onIssueTemporaryPassword,
}: UserRowProps) {
  const isDeactivated = user.deactivatedAt !== null;
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-6 py-3">
      <div className="grid min-w-0">
        <span className="font-medium break-words">{user.name}</span>
        <span className="text-sm break-words text-muted-foreground">@{user.username}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {user.isAdministrator && <Badge variant="secondary">Administrator</Badge>}
        {isDeactivated ? (
          <>
            <Badge variant="destructive">Deactivated</Badge>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              aria-label={`Reactivate ${user.name}`}
              onClick={() => {
                onReactivate(user.id);
              }}
            >
              <UserCheck className="size-4" aria-hidden="true" />
              Reactivate
            </Button>
          </>
        ) : (
          <>
            {user.mustChangePassword && <Badge variant="outline">Temporary Password</Badge>}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              aria-label={`Issue Temporary Password for ${user.name}`}
              onClick={() => {
                onIssueTemporaryPassword(user.id);
              }}
            >
              <KeyRound className="size-4" aria-hidden="true" />
              Reset password
            </Button>
            {!isSelf && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                aria-label={`Deactivate ${user.name}`}
                onClick={() => {
                  onDeactivate(user.id);
                }}
              >
                <UserX className="size-4" aria-hidden="true" />
                Deactivate
              </Button>
            )}
          </>
        )}
      </div>
    </li>
  );
}

interface UsersListBodyProps {
  isPending: boolean;
  isError: boolean;
  error: unknown;
  data: UserPage | undefined;
  currentUserId: string;
  busy: boolean;
  onPageChange: (page: number) => void;
  onDeactivate: (userId: string) => void;
  onReactivate: (userId: string) => void;
  onIssueTemporaryPassword: (userId: string) => void;
}

function UsersListBody({
  isPending,
  isError,
  error,
  data,
  currentUserId,
  busy,
  onPageChange,
  onDeactivate,
  onReactivate,
  onIssueTemporaryPassword,
}: UsersListBodyProps) {
  if (isPending) {
    return (
      <CardContent className="py-6">
        <span
          role="status"
          aria-label="Loading"
          className="inline-flex items-center text-muted-foreground"
        >
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        </span>
      </CardContent>
    );
  }
  if (isError || !data) {
    return (
      <CardContent className="py-6">
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertDescription role="alert">{errorMessage(error)}</AlertDescription>
        </Alert>
      </CardContent>
    );
  }
  return (
    <>
      <ul className="m-0 list-none divide-y p-0">
        {data.items.map((item) => (
          <UserRow
            key={item.id}
            user={item}
            isSelf={item.id === currentUserId}
            busy={busy}
            onDeactivate={onDeactivate}
            onReactivate={onReactivate}
            onIssueTemporaryPassword={onIssueTemporaryPassword}
          />
        ))}
      </ul>
      {data.totalPages > 1 && (
        <CardFooter className="justify-between border-t py-3 text-sm text-muted-foreground">
          <span>
            Page {data.page} of {data.totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={data.page <= 1}
              onClick={() => {
                onPageChange(data.page - 1);
              }}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={data.page >= data.totalPages}
              onClick={() => {
                onPageChange(data.page + 1);
              }}
            >
              Next
            </Button>
          </div>
        </CardFooter>
      )}
    </>
  );
}

/** Instance-level User administration screen, visible only to Administrators. */
export function UsersPage() {
  const titleId = useId();
  const { data: currentUser } = useCurrentUser();
  const [page, setPage] = useState(1);
  const [issuedPassword, setIssuedPassword] = useState<{
    username: string;
    password: string;
  } | null>(null);

  const query = useUsers(page);
  const deactivate = useDeactivateUser();
  const reactivate = useReactivateUser();
  const resetPassword = useIssueTemporaryPassword();

  if (!currentUser?.isAdministrator) {
    return <Navigate to="/" replace />;
  }

  const actionError = deactivate.isError
    ? deactivate.error
    : reactivate.isError
      ? reactivate.error
      : resetPassword.isError
        ? resetPassword.error
        : null;
  const busy = deactivate.isPending || reactivate.isPending || resetPassword.isPending;

  function resetMutations() {
    deactivate.reset();
    reactivate.reset();
    resetPassword.reset();
  }

  function handleDeactivate(userId: string) {
    resetMutations();
    setIssuedPassword(null);
    deactivate.mutate(userId);
  }

  function handleReactivate(userId: string) {
    resetMutations();
    setIssuedPassword(null);
    reactivate.mutate(userId);
  }

  function handleIssueTemporaryPassword(userId: string) {
    resetMutations();
    resetPassword.mutate(userId, {
      onSuccess: (issued) => {
        setIssuedPassword({ username: issued.username, password: issued.temporaryPassword });
      },
    });
  }

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-center gap-2">
        <h1 className="min-w-0 text-2xl font-semibold tracking-tight break-words">Users</h1>
      </header>
      <section aria-labelledby={titleId}>
        <Card className="gap-0 overflow-hidden py-0">
          <CardHeader className="items-center border-b py-4">
            <CardTitle>
              <h2 id={titleId}>All Users</h2>
            </CardTitle>
          </CardHeader>
          {actionError && (
            <div className="border-b p-6">
              <Alert variant="destructive">
                <AlertCircle aria-hidden="true" />
                <AlertDescription role="alert">{errorMessage(actionError)}</AlertDescription>
              </Alert>
            </div>
          )}
          {issuedPassword && (
            <TemporaryPasswordBanner
              username={issuedPassword.username}
              password={issuedPassword.password}
              onDismiss={() => {
                setIssuedPassword(null);
              }}
            />
          )}
          <UsersListBody
            isPending={query.isPending}
            isError={query.isError}
            error={query.error}
            data={query.data}
            currentUserId={currentUser.id}
            busy={busy}
            onPageChange={setPage}
            onDeactivate={handleDeactivate}
            onReactivate={handleReactivate}
            onIssueTemporaryPassword={handleIssueTemporaryPassword}
          />
        </Card>
      </section>
    </div>
  );
}
