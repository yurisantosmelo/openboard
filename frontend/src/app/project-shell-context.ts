import { createContext, useContext } from 'react';
import type { Project, ProjectView, ViewLayout } from '@/features/projects';

export type ProjectConfigTab = 'workflow' | 'eras' | 'teams' | 'settings';

export interface ProjectShellState {
  project: Project;
  activeViewMode: ViewLayout;
  activeViewId: string | null;
  views: ProjectView[];
  searchQuery: string;
  configOpen: boolean;
  configTab: ProjectConfigTab;
  canWrite: boolean;
  canCreateWorkItem: boolean;
  onSelectLayout: (mode: ViewLayout) => void;
  onSelectSavedView: (view: ProjectView | null) => void;
  onRequestSaveView: () => void;
  onSearchChange: (query: string) => void;
  onToggleConfig: () => void;
  onOpenConfigTab: (tab: ProjectConfigTab) => void;
  onStartCreateWorkItem: () => void;
}

export interface ProjectShellContextValue {
  shell: ProjectShellState | null;
  setShell: (shell: ProjectShellState | null) => void;
}

export const ProjectShellContext = createContext<ProjectShellContextValue>({
  shell: null,
  setShell: () => undefined,
});

export function useProjectShell() {
  return useContext(ProjectShellContext);
}
