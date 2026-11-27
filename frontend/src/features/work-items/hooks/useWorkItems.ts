import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createWorkItem,
  createWorkItemLink,
  deleteWorkItem,
  deleteWorkItemLink,
  getWorkItem,
  listWorkItemLinks,
  listWorkItems,
  transitionWorkItem,
  updateWorkItem,
  type CreateWorkItemPayload,
  type LinkKind,
  type UpdateWorkItemPayload,
  type WorkItemFilters,
} from '../api/workItemsApi';

const workItemsKey = (projectId: string) => ['work-items', projectId] as const;
const linksKey = (workItemId: string) => ['work-item-links', workItemId] as const;

export function useWorkItems(projectId: string, filters: WorkItemFilters, page: number) {
  return useQuery({
    queryKey: [...workItemsKey(projectId), filters, page],
    queryFn: ({ signal }) => listWorkItems(projectId, filters, page, signal),
    enabled: Boolean(projectId),
  });
}

export function useWorkItem(workItemId: string) {
  return useQuery({
    queryKey: ['work-item', workItemId],
    queryFn: ({ signal }) => getWorkItem(workItemId, signal),
    enabled: Boolean(workItemId),
  });
}

export function useCreateWorkItem(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateWorkItemPayload) => createWorkItem(projectId, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: workItemsKey(projectId) }),
  });
}

export function useUpdateWorkItem(workItemId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateWorkItemPayload) => updateWorkItem(workItemId, payload),
    onSuccess: (item) => {
      queryClient.setQueryData(['work-item', workItemId], item);
      return queryClient.invalidateQueries({ queryKey: workItemsKey(item.projectId) });
    },
  });
}

export function useTransitionWorkItem(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ workItemId, statusId }: { workItemId: string; statusId: string }) =>
      transitionWorkItem(workItemId, statusId),
    onSuccess: (item) => {
      queryClient.setQueryData(['work-item', item.id], item);
      return queryClient.invalidateQueries({ queryKey: workItemsKey(projectId) });
    },
  });
}

export function useAssignWorkItem(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ workItemId, assigneeId }: { workItemId: string; assigneeId: string | null }) =>
      updateWorkItem(workItemId, { assigneeId }),
    onSuccess: (item) => {
      queryClient.setQueryData(['work-item', item.id], item);
      return queryClient.invalidateQueries({ queryKey: workItemsKey(projectId) });
    },
  });
}

export function useDeleteWorkItem(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (workItemId: string) => deleteWorkItem(workItemId),
    onSuccess: (_data, workItemId) => {
      queryClient.removeQueries({ queryKey: ['work-item', workItemId] });
      return queryClient.invalidateQueries({ queryKey: workItemsKey(projectId) });
    },
  });
}

export function useWorkItemLinks(workItemId: string) {
  return useQuery({
    queryKey: linksKey(workItemId),
    queryFn: ({ signal }) => listWorkItemLinks(workItemId, signal),
    enabled: Boolean(workItemId),
  });
}

export function useCreateWorkItemLink(workItemId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ targetWorkItemId, kind }: { targetWorkItemId: string; kind: LinkKind }) =>
      createWorkItemLink(workItemId, targetWorkItemId, kind),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: linksKey(workItemId) }),
  });
}

export function useDeleteWorkItemLink(workItemId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (linkId: string) => deleteWorkItemLink(workItemId, linkId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: linksKey(workItemId) }),
  });
}
