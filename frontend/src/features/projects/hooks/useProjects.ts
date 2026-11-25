import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createProject,
  getProject,
  listProjects,
  listProjectStatuses,
  listProjectWorkItemTypes,
  renameProject,
} from '../api/projectsApi';

const projectsKey = (workspaceId: string) => ['projects', workspaceId] as const;

export function useProjects(workspaceId: string, page: number) {
  return useQuery({
    queryKey: [...projectsKey(workspaceId), page],
    queryFn: ({ signal }) => listProjects(workspaceId, page, signal),
  });
}

export function useProject(projectId: string) {
  return useQuery({
    queryKey: ['project', projectId],
    queryFn: ({ signal }) => getProject(projectId, signal),
  });
}

export function useCreateProject(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createProject(workspaceId, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectsKey(workspaceId) }),
  });
}

export function useRenameProject(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => renameProject(projectId, name),
    onSuccess: (project) => {
      queryClient.setQueryData(['project', projectId], project);
      return queryClient.invalidateQueries({ queryKey: projectsKey(project.workspaceId) });
    },
  });
}

export function useProjectStatuses(projectId: string) {
  return useQuery({
    queryKey: ['project-statuses', projectId],
    queryFn: ({ signal }) => listProjectStatuses(projectId, signal),
  });
}

export function useProjectWorkItemTypes(projectId: string) {
  return useQuery({
    queryKey: ['project-work-item-types', projectId],
    queryFn: ({ signal }) => listProjectWorkItemTypes(projectId, signal),
  });
}
