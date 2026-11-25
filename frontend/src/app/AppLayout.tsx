import { LayoutGrid } from 'lucide-react';
import { Link, NavLink, Outlet } from 'react-router';
import { CurrentUserMenu } from '../features/auth';

export function AppLayout() {
  return (
    <div className="grid min-h-screen bg-background text-foreground md:grid-cols-[240px_1fr]">
      <aside className="flex flex-col gap-6 border-b bg-card p-4 md:border-r md:border-b-0">
        <Link
          to="/"
          className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground no-underline"
        >
          <span className="flex size-7 items-center justify-center rounded-md bg-muted text-foreground">
            <LayoutGrid className="size-4" aria-hidden="true" />
          </span>
          OpenBoard
        </Link>
        <nav className="flex flex-col gap-1" aria-label="Main">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              }`
            }
          >
            <LayoutGrid className="size-4" aria-hidden="true" />
            <span>Home</span>
          </NavLink>
        </nav>
      </aside>
      <main className="flex min-w-0 flex-col">
        <header className="flex h-14 items-center justify-between border-b bg-card px-6">
          <span className="text-sm font-medium text-muted-foreground">OpenBoard</span>
          <CurrentUserMenu />
        </header>
        <div className="mx-auto w-full max-w-4xl p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
