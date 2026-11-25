import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createWorkItem,
  deleteWorkItem,
  getWorkItem,
  listWorkItems,
  transitionWorkItem,
  updateWorkItem,
  type CreateWorkItemPayload,
  type UpdateWorkItemPayload,
  type WorkItemFilters,
} from '../api/workItemsApi';

const workItemsKey = (projectId: string) => ['work-items', projectId] as const;

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
