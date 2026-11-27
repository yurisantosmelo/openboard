import { Building2, Inbox, KeyRound, LogOut, Settings2 } from 'lucide-react';
import { useEffect, useRef, type RefObject } from 'react';
import { Link } from 'react-router';
import { ContextSwitchers } from '@/app/ContextSwitchers';
import { clearNavigationContext } from '@/app/navigationContext';
import { useProjectShell } from '@/app/project-shell-context';
import { usePortalAccess } from '@/app/usePortalAccess';
import { ThemeToggle } from '@/components/theme-toggle';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { IconButton } from '@/components/ui/icon-button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SearchInput } from '@/components/ui/search-input';
import { CHANGE_PASSWORD_PATH, useCurrentUser, useSignOut } from '@/features/auth';

const SHORTCUT_ITEMS = [
  { label: 'Global search', keys: 'Ctrl + /' },
  { label: 'Submit Work Item', keys: 'Ctrl + Enter' },
  { label: 'Close overlay', keys: 'Esc' },
] as const;

function userInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) return 'U';
  const second = parts[1];
  if (!second) return first.slice(0, 2).toUpperCase();
  return `${first.charAt(0)}${second.charAt(0)}`.toUpperCase();
}

function useGlobalSearchShortcut(
  inputRef: RefObject<HTMLInputElement | null>,
  enabled: boolean,
): void {
  useEffect(() => {
    if (!enabled) return undefined;

    function handleKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.key !== '/') return;
      event.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [enabled, inputRef]);
}

function HeaderNotificationsButton() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <IconButton
          variant="outline"
          size="md"
          aria-label="Notifications"
          title="Notifications"
          className="[&_svg]:size-3.5"
        >
          <span className="relative inline-flex size-3.5 items-center justify-center">
            <Inbox className="size-3.5" aria-hidden="true" />
            <span
              aria-hidden="true"
              className="absolute -top-0.5 -right-0.5 size-[5px] rounded-xs bg-primary"
            />
          </span>
        </IconButton>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3">
        <div className="flex items-center justify-between pb-2">
          <span className="text-xs font-semibold text-foreground">Notifications</span>
          <span className="text-3xs font-medium tracking-wider text-muted-foreground uppercase">
            Inbox
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          You&apos;re all caught up. Assignments, mentions, and Work Item updates will appear here.
        </p>
      </PopoverContent>
    </Popover>
  );
}

function HeaderHelpButton() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <IconButton
          variant="outline"
          size="md"
          aria-label="Help and keyboard shortcuts"
          title="Help & keyboard shortcuts"
        >
          <span aria-hidden="true" className="text-xs leading-none font-medium">
            ?
          </span>
        </IconButton>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-3">
        <div className="pb-2 text-xs font-semibold text-foreground">Keyboard shortcuts</div>
        <div className="flex flex-col gap-2">
          {SHORTCUT_ITEMS.map((item) => (
            <div key={item.label} className="flex items-center justify-between gap-2 text-xs">
              <span className="text-muted-foreground">{item.label}</span>
              <kbd className="inline-flex h-5 shrink-0 items-center rounded-xs border border-border bg-secondary px-[5px] font-sans text-2xs font-normal text-muted-foreground">
                {item.keys}
              </kbd>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function HeaderUserMenu() {
  const { data: user } = useCurrentUser();
  const signOut = useSignOut();
  const { canAccessPortal } = usePortalAccess();
  const { shell } = useProjectShell();

  if (!user) return null;

  return (
    <>
      <span aria-hidden="true" className="h-[18px] w-px shrink-0 bg-border" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            data-slot="header-user-avatar"
            aria-label={user.name}
            title={user.name}
            className="inline-flex size-[26px] shrink-0 cursor-pointer items-center justify-center rounded-full ring-2 ring-card outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Avatar className="size-[26px]">
              <AvatarFallback className="bg-primary/10 text-2xs font-semibold text-primary">
                {userInitials(user.name)}
              </AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="flex flex-col gap-0.5 py-1.5">
            <span className="truncate text-xs font-semibold text-foreground">{user.name}</span>
            <span className="truncate text-2xs font-normal text-muted-foreground">
              @{user.username}
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {canAccessPortal && (
            <DropdownMenuItem asChild>
              <Link to="/organizations" aria-label="Management Portal">
                <Building2 className="size-3.5" aria-hidden="true" />
                <span>Management Portal</span>
              </Link>
            </DropdownMenuItem>
          )}
          {shell && (
            <DropdownMenuItem onSelect={shell.onToggleConfig}>
              <Settings2 className="size-3.5" aria-hidden="true" />
              <span>Project configuration</span>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem asChild>
            <Link to={CHANGE_PASSWORD_PATH}>
              <KeyRound className="size-3.5" aria-hidden="true" />
              <span>Change password</span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            disabled={signOut.isPending}
            onSelect={() => {
              clearNavigationContext();
              signOut.mutate();
            }}
          >
            <LogOut className="size-3.5" aria-hidden="true" />
            <span>Sign out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

export function GlobalHeader() {
  const { shell } = useProjectShell();
  const searchInputRef = useRef<HTMLInputElement>(null);

  useGlobalSearchShortcut(searchInputRef, shell !== null);

  return (
    <header
      data-slot="global-header"
      className="flex h-[var(--workspace-topbar-height)] w-full shrink-0 items-center justify-between gap-4 border-b border-border bg-card px-6"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {shell && (
          <SearchInput
            ref={searchInputRef}
            aria-label="Global search work items"
            placeholder="Search work items, projects, views..."
            shortcut="Ctrl + /"
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
        <ThemeToggle />
        <HeaderNotificationsButton />
        <HeaderHelpButton />
        <HeaderUserMenu />
      </div>
    </header>
  );
}
