import { KeyRound, LayoutGrid, Users } from 'lucide-react';
import type { ComponentProps } from 'react';
import { Link } from 'react-router';
import { NavMain, type NavMainItem } from '@/components/nav-main';
import { NavUser } from '@/components/nav-user';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';
import { useCurrentUser, useSignOut } from '@/features/auth';
import { USERS_PATH } from '@/features/users';

const navMain: NavMainItem[] = [
  { title: 'Home', url: '/', icon: LayoutGrid },
  { title: 'Change password', url: '/change-password', icon: KeyRound },
];

const adminNavMain: NavMainItem[] = [
  { title: 'Home', url: '/', icon: LayoutGrid },
  { title: 'Users', url: USERS_PATH, icon: Users },
  { title: 'Change password', url: '/change-password', icon: KeyRound },
];

export function AppSidebar({ ...props }: ComponentProps<typeof Sidebar>) {
  const { data: user } = useCurrentUser();
  const signOut = useSignOut();
  const items = user?.isAdministrator ? adminNavMain : navMain;

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to="/">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <LayoutGrid className="size-4" aria-hidden="true" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">OpenBoard</span>
                  <span className="truncate text-xs">Work tracking</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={items} />
      </SidebarContent>
      {user && (
        <SidebarFooter>
          <NavUser
            user={{ name: user.name, username: user.username }}
            onSignOut={() => {
              signOut.mutate();
            }}
          />
        </SidebarFooter>
      )}
      <SidebarRail />
    </Sidebar>
  );
}
