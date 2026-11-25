import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCurrentUser, useSignOut } from '../hooks/useAuth';

/** The signed-in User's name and the sign-out action, for the app header. */
export function CurrentUserMenu() {
  const { data: user } = useCurrentUser();
  const signOut = useSignOut();
  if (!user) {
    return null;
  }
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-muted-foreground">{user.name}</span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={signOut.isPending}
        aria-busy={signOut.isPending || undefined}
        onClick={() => {
          signOut.mutate();
        }}
      >
        <LogOut className="size-4" aria-hidden="true" />
        Sign out
      </Button>
    </div>
  );
}
