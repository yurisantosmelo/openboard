import { Building2, Settings2 } from 'lucide-react';
import { Link } from 'react-router';
import { ContextSwitchers } from '@/app/ContextSwitchers';
import { useProjectShell } from '@/app/project-shell-context';
import { usePortalAccess } from '@/app/usePortalAccess';
import { ThemeToggle } from '@/components/theme-toggle';
import { buttonVariants } from '@/components/ui/button-variants';
import { IconButton } from '@/components/ui/icon-button';
import { SearchInput } from '@/components/ui/search-input';
import { CurrentUserMenu } from '@/features/auth';

export function GlobalHeader() {
  const { shell } = useProjectShell();
  const { canAccessPortal } = usePortalAccess();

  return (
    <header
      data-slot="global-header"
      className="flex h-[var(--workspace-topbar-height)] w-full shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {shell && (
          <SearchInput
            aria-label="Global search work items"
            placeholder="Search work items, projects, views..."
            shortcut="⌘K"
            value={shell.searchQuery}
            onChange={(e) => {
              shell.onSearchChange(e.target.value);
            }}
            onClear={() => {
              shell.onSearchChange('');
            }}
            containerClassName="max-w-[380px]"
          />
        )}
        <ContextSwitchers />
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
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
          <IconButton
            variant={shell.configOpen ? 'active' : 'ghost'}
            size="md"
            aria-label="Toggle project configuration"
            aria-pressed={shell.configOpen}
            title="Project configuration"
            onClick={shell.onToggleConfig}
          >
            <Settings2 aria-hidden="true" />
          </IconButton>
        )}
        <CurrentUserMenu />
      </div>
    </header>
  );
}
