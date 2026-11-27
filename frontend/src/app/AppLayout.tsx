import { Outlet } from 'react-router';
import { GlobalHeader } from '@/components/global-header';
import { ProjectSidebar } from '@/components/project-sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useProjectShell } from './project-shell-context';
import { ProjectShellProvider } from './ProjectShellProvider';

function AppLayoutFrame() {
  const { shell } = useProjectShell();
  const isProjectShell = shell !== null;

  return (
    <div className="flex h-svh w-full overflow-hidden bg-background text-foreground">
      {isProjectShell && <ProjectSidebar />}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <GlobalHeader />
        <main
          className={
            isProjectShell
              ? 'flex min-h-0 flex-1 flex-col overflow-hidden'
              : 'flex flex-1 flex-col gap-4 overflow-y-auto p-4 md:p-6'
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
      </div>
    </div>
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
