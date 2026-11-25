import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AlertCircle } from 'lucide-react';
import { MemoryRouter } from 'react-router';
import { FormField } from '../form-field';
import { NavUser } from '../nav-user';
import { ThemeToggle } from '../theme-toggle';
import { cn } from '@/lib/utils';
import { setThemePreference } from '@/hooks/use-theme';
import { Alert, AlertDescription } from './alert';
import { Badge } from './badge';
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from './breadcrumb';
import { Button } from './button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from './card';
import { FieldDescription, FieldError, FieldSeparator } from './field';
import {
  Sidebar,
  SidebarContent,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarProvider,
  SidebarTrigger,
} from './sidebar';
import { useSidebar } from './sidebar-context';

describe('shadcn/ui components', () => {
  it('renders Button as button or child via Slot', () => {
    render(
      <div>
        <Button type="button">Save</Button>
        <Button asChild variant="link">
          <a href="/home">Go home</a>
        </Button>
      </div>,
    );
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('type', 'button');
    expect(screen.getByRole('link', { name: 'Go home' })).toHaveAttribute('href', '/home');
  });

  it('wires FormField validation errors to aria-invalid and aria-describedby', () => {
    render(<FormField label="Email" error="Invalid email" />);
    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Invalid email');
  });

  it('renders Card, Badge, Alert, Breadcrumb and Field helpers', () => {
    render(
      <div>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/">Home</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbEllipsis />
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Details</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Summary</h2>
            </CardTitle>
            <Badge>Active</Badge>
          </CardHeader>
          <CardContent>
            <Alert variant="destructive">
              <AlertCircle aria-hidden="true" />
              <AlertDescription role="alert">Something failed</AlertDescription>
            </Alert>
            <FieldDescription>Help text</FieldDescription>
            <FieldSeparator>Or</FieldSeparator>
            <FieldError errors={[{ message: 'First error' }]} />
            <FieldError errors={[{ message: 'Error A' }, { message: 'Error B' }]} />
            <FieldError>Custom error</FieldError>
            <FieldError errors={[]} />
          </CardContent>
          <CardFooter>Footer</CardFooter>
        </Card>
      </div>,
    );
    expect(screen.getByRole('heading', { name: 'Summary' })).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Something failed')).toBeInTheDocument();
    expect(screen.getByText('First error')).toBeInTheDocument();
    expect(screen.getByText('Error A')).toBeInTheDocument();
    expect(screen.getByText('Custom error')).toBeInTheDocument();
    expect(screen.getByText('Footer')).toBeInTheDocument();
  });

  it('toggles Sidebar via trigger button and keyboard shortcut', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <SidebarProvider>
        <Sidebar collapsible="icon">
          <SidebarContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Dashboard">Dashboard</SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuSkeleton showIcon />
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarContent>
        </Sidebar>
        <SidebarInset>
          <SidebarTrigger />
        </SidebarInset>
      </SidebarProvider>,
    );

    const sidebar = container.querySelector('[data-slot="sidebar"]');
    expect(sidebar).toHaveAttribute('data-state', 'expanded');

    await user.click(screen.getByRole('button', { name: 'Toggle Sidebar' }));
    expect(sidebar).toHaveAttribute('data-state', 'collapsed');

    await user.keyboard('{Control>}b{/Control}');
    expect(sidebar).toHaveAttribute('data-state', 'expanded');
  });

  it('opens the mobile Sheet sidebar when viewport is narrow', async () => {
    const user = userEvent.setup();
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 500 });
    try {
      render(
        <SidebarProvider>
          <Sidebar>
            <SidebarContent>Mobile menu</SidebarContent>
          </Sidebar>
          <SidebarInset>
            <SidebarTrigger />
          </SidebarInset>
        </SidebarProvider>,
      );

      await user.click(screen.getByRole('button', { name: 'Toggle Sidebar' }));
      expect(await screen.findByText('Mobile menu')).toBeInTheDocument();
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
    }
  });

  it('opens NavUser dropdown menu and triggers sign out', async () => {
    const user = userEvent.setup();
    const onSignOut = vi.fn();
    render(
      <MemoryRouter>
        <SidebarProvider>
          <Sidebar collapsible="none">
            <SidebarContent>
              <NavUser user={{ name: 'Ada Lovelace', username: 'ada' }} onSignOut={onSignOut} />
            </SidebarContent>
          </Sidebar>
        </SidebarProvider>
      </MemoryRouter>,
    );

    expect(screen.getByText('AL')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Ada Lovelace/ }));
    expect(await screen.findByRole('menuitem', { name: 'Change password' })).toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it('throws when useSidebar is called outside SidebarProvider', () => {
    function Orphan() {
      useSidebar();
      return null;
    }
    expect(() => render(<Orphan />)).toThrow('useSidebar must be used within a SidebarProvider.');
  });

  it('merges compact typography classes with text colors in cn()', () => {
    expect(cn('text-2xs text-muted-foreground')).toBe('text-2xs text-muted-foreground');
    expect(cn('text-sm text-3xs')).toBe('text-3xs');
  });

  it('cycles theme preferences via ThemeToggle and syncs dark class', async () => {
    const user = userEvent.setup();
    window.localStorage.removeItem('openboard:theme');
    setThemePreference('system');

    render(<ThemeToggle />);
    const button = screen.getByRole('button', { name: /Theme: System/i });
    await user.click(button);
    expect(window.localStorage.getItem('openboard:theme')).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    await user.click(screen.getByRole('button', { name: /Theme: Light/i }));
    expect(window.localStorage.getItem('openboard:theme')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    await user.click(screen.getByRole('button', { name: /Theme: Dark/i }));
    expect(window.localStorage.getItem('openboard:theme')).toBe('system');
  });
});
