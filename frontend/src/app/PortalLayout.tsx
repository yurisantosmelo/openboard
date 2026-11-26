import { Building2, LayoutGrid, Users } from 'lucide-react';
import { Link, Outlet, useLocation } from 'react-router';
import { ThemeToggle } from '@/components/theme-toggle';
import { Separator } from '@/components/ui/separator';
import { TooltipProvider } from '@/components/ui/tooltip';
import { CurrentUserMenu, useCurrentUser } from '@/features/auth';
import { USERS_PATH } from '@/features/users';
import { cn } from '@/lib/utils';
import { usePortalAccess } from './usePortalAccess';

function portalNavClass(active: boolean): string {
  return cn(
    'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
    active
      ? 'bg-primary/10 text-primary'
      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
  );
}

function PortalTopNav() {
  const { data: user } = useCurrentUser();
  const { canAccessPortal } = usePortalAccess();
  const { pathname } = useLocation();

  if (!user || !canAccessPortal) return null;

  const onPortal = pathname === '/' || pathname === '/organizations';

  return (
    <nav aria-label="Portal navigation" className="flex items-center gap-1">
      <Link to="/organizations" className={portalNavClass(onPortal)}>
        <Building2 className="size-3.5" aria-hidden="true" />
        Organizations
      </Link>
      {user.isAdministrator && (
        <Link to={USERS_PATH} className={portalNavClass(pathname === USERS_PATH)}>
          <Users className="size-3.5" aria-hidden="true" />
          Users
        </Link>
      )}
    </nav>
  );
}

/** Standalone layout for the Management Portal and administrative pages (no Board sidebar). */
export function PortalLayout() {
  return (
    <TooltipProvider>
      <div className="flex min-h-svh flex-col bg-background">
        <header className="surface-glass sticky top-0 z-30 flex h-[var(--workspace-topbar-height)] w-full shrink-0 items-center justify-between gap-3 border-b border-border px-4 md:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <Link
              to="/"
              className="flex shrink-0 items-center gap-2 rounded-md px-1.5 py-1 text-sm font-semibold tracking-tight hover:bg-accent/60"
            >
              <span className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-xs shadow-primary/24">
                <LayoutGrid className="size-3.5" aria-hidden="true" />
              </span>
              <span>OpenBoard</span>
            </Link>
            <Separator orientation="vertical" className="data-[orientation=vertical]:h-4" />
            <PortalTopNav />
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <CurrentUserMenu />
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-6 md:px-8 md:py-8">
          <Outlet />
        </main>
      </div>
    </TooltipProvider>
  );
}
