import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addProjectTransitionRule,
  createProject,
  createProjectStatus,
  createProjectWorkItemType,
  deleteProjectStatus,
  deleteProjectWorkItemType,
  getProject,
  listProjects,
  listProjectStatuses,
  listProjectTransitionRules,
  listProjectWorkItemTypes,
  removeProjectTransitionRule,
  renameProject,
  updateProjectStatus,
  updateProjectWorkItemType,
  type CreateStatusPayload,
  type CreateWorkItemTypePayload,
  type UpdateStatusPayload,
  type UpdateWorkItemTypePayload,
} from '../api/projectsApi';

const projectsKey = (workspaceId: string) => ['projects', workspaceId] as const;
const statusesKey = (projectId: string) => ['project-statuses', projectId] as const;
const typesKey = (projectId: string) => ['project-work-item-types', projectId] as const;
const rulesKey = (projectId: string) => ['project-transition-rules', projectId] as const;

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
    queryKey: statusesKey(projectId),
    queryFn: ({ signal }) => listProjectStatuses(projectId, signal),
  });
}

export function useCreateProjectStatus(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateStatusPayload) => createProjectStatus(projectId, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: statusesKey(projectId) }),
  });
}

export function useUpdateProjectStatus(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ statusId, payload }: { statusId: string; payload: UpdateStatusPayload }) =>
      updateProjectStatus(projectId, statusId, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: statusesKey(projectId) }),
  });
}

export function useDeleteProjectStatus(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      statusId,
      replacementStatusId,
    }: {
      statusId: string;
      replacementStatusId: string;
    }) => deleteProjectStatus(projectId, statusId, replacementStatusId),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: statusesKey(projectId) }),
        queryClient.invalidateQueries({ queryKey: rulesKey(projectId) }),
        queryClient.invalidateQueries({ queryKey: ['work-items', projectId] }),
      ]),
  });
}

export function useProjectWorkItemTypes(projectId: string) {
  return useQuery({
    queryKey: typesKey(projectId),
    queryFn: ({ signal }) => listProjectWorkItemTypes(projectId, signal),
  });
}

export function useCreateProjectWorkItemType(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateWorkItemTypePayload) =>
      createProjectWorkItemType(projectId, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: typesKey(projectId) }),
  });
}

export function useUpdateProjectWorkItemType(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ typeId, payload }: { typeId: string; payload: UpdateWorkItemTypePayload }) =>
      updateProjectWorkItemType(projectId, typeId, payload),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: typesKey(projectId) }),
        queryClient.invalidateQueries({ queryKey: ['work-items', projectId] }),
      ]),
  });
}

export function useDeleteProjectWorkItemType(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ typeId, replacementTypeId }: { typeId: string; replacementTypeId: string }) =>
      deleteProjectWorkItemType(projectId, typeId, replacementTypeId),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: typesKey(projectId) }),
        queryClient.invalidateQueries({ queryKey: ['work-items', projectId] }),
      ]),
  });
}

export function useProjectTransitionRules(projectId: string) {
  return useQuery({
    queryKey: rulesKey(projectId),
    queryFn: ({ signal }) => listProjectTransitionRules(projectId, signal),
  });
}

export function useAddProjectTransitionRule(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ fromStatusId, toStatusId }: { fromStatusId: string; toStatusId: string }) =>
      addProjectTransitionRule(projectId, fromStatusId, toStatusId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: rulesKey(projectId) }),
  });
}

export function useRemoveProjectTransitionRule(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ fromStatusId, toStatusId }: { fromStatusId: string; toStatusId: string }) =>
      removeProjectTransitionRule(projectId, fromStatusId, toStatusId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: rulesKey(projectId) }),
  });
}
