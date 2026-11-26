import { Building2, LayoutGrid, Plus, Search, Settings2 } from 'lucide-react';
import { Link, Outlet } from 'react-router';
import { AppSidebar } from '@/components/app-sidebar';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { CurrentUserMenu } from '@/features/auth';
import { ContextSwitchers } from './ContextSwitchers';
import { useProjectShell } from './project-shell-context';
import { ProjectShellProvider } from './ProjectShellProvider';
import { usePortalAccess } from './usePortalAccess';

function AppTopHeader() {
  const { shell } = useProjectShell();
  const { canAccessPortal } = usePortalAccess();

  return (
    <header className="surface-glass sticky top-0 z-30 flex h-[var(--workspace-topbar-height)] w-full shrink-0 items-center justify-between gap-3 border-b border-border px-3 md:px-4">
      <div className="flex min-w-0 items-center gap-1.5">
        {shell && (
          <>
            <SidebarTrigger className="-ml-0.5" />
            <Separator orientation="vertical" className="data-[orientation=vertical]:h-4" />
          </>
        )}
        <Link
          to="/"
          className="flex shrink-0 items-center gap-2 rounded-md px-1.5 py-1 text-sm font-semibold tracking-tight hover:bg-accent/60"
        >
          <span className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-xs shadow-primary/24">
            <LayoutGrid className="size-3.5" aria-hidden="true" />
          </span>
          <span className="hidden sm:inline">OpenBoard</span>
        </Link>
        <Separator orientation="vertical" className="data-[orientation=vertical]:h-4" />
        <ContextSwitchers />
        {shell?.canCreateWorkItem && (
          <Button
            type="button"
            size="compact"
            className="ml-1"
            onClick={shell.onStartCreateWorkItem}
          >
            <Plus className="size-3.5" aria-hidden="true" />
            Create
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2">
        {shell && (
          <div className="relative hidden w-56 lg:block">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              aria-label="Global search work items"
              placeholder="Search work items..."
              value={shell.searchQuery}
              onChange={(e) => {
                shell.onSearchChange(e.target.value);
              }}
              className="h-7 bg-muted/50 pl-8 text-xs"
            />
          </div>
        )}
        {canAccessPortal && (
          <Link
            to="/organizations"
            aria-label="Management Portal"
            title="Manage Organizations, Workspaces and Projects"
            className={buttonVariants({ variant: 'ghost', size: 'compact' })}
          >
            <Building2 className="size-3.5" aria-hidden="true" />
            <span className="hidden md:inline">Portal</span>
          </Link>
        )}
        <ThemeToggle />
        {shell && (
          <Button
            type="button"
            size="icon-sm"
            variant={shell.configOpen ? 'secondary' : 'ghost'}
            aria-label="Toggle project configuration"
            aria-pressed={shell.configOpen}
            title="Project configuration"
            onClick={shell.onToggleConfig}
          >
            <Settings2 className="size-4" aria-hidden="true" />
          </Button>
        )}
        <CurrentUserMenu />
      </div>
    </header>
  );
}

function AppLayoutFrame() {
  const { shell } = useProjectShell();
  const isProjectShell = shell !== null;

  return (
    <SidebarProvider className="flex-col">
      <AppTopHeader />
      <div className="flex min-h-0 flex-1">
        {isProjectShell && (
          <AppSidebar className="inset-y-auto top-[var(--workspace-topbar-height)] bottom-0 h-[calc(100svh-var(--workspace-topbar-height))]" />
        )}
        <SidebarInset className="min-h-0 min-w-0 flex-1">
          <main
            className={
              isProjectShell
                ? 'flex min-h-0 flex-1 flex-col overflow-hidden'
                : 'flex flex-1 flex-col gap-4 p-4 md:p-6'
            }
          >
            <div
              className={
                isProjectShell
                  ? 'flex min-h-0 flex-1 flex-col overflow-hidden'
                  : 'mx-auto w-full max-w-5xl'
              }
            >
              <Outlet />
            </div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

export function AppLayout() {
  return (
    <TooltipProvider>
      <ProjectShellProvider>
        <AppLayoutFrame />
      </ProjectShellProvider>
    </TooltipProvider>
  );
}
