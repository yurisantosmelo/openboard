import { useMemo, useState, type ReactNode } from 'react';
import { ProjectShellContext, type ProjectShellState } from './project-shell-context';

export function ProjectShellProvider({ children }: { children: ReactNode }) {
  const [shell, setShell] = useState<ProjectShellState | null>(null);
  const value = useMemo(() => ({ shell, setShell }), [shell]);
  return <ProjectShellContext.Provider value={value}>{children}</ProjectShellContext.Provider>;
}
