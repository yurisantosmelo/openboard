import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createProjectView,
  deleteProjectView,
  listProjectViews,
  updateProjectView,
  type CreateViewPayload,
  type UpdateViewPayload,
} from '../api/viewsApi';

const viewsKey = (projectId: string) => ['project-views', projectId] as const;

export function useProjectViews(projectId: string) {
  return useQuery({
    queryKey: viewsKey(projectId),
    queryFn: ({ signal }) => listProjectViews(projectId, signal),
    enabled: Boolean(projectId),
  });
}

export function useCreateProjectView(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateViewPayload) => createProjectView(projectId, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: viewsKey(projectId) }),
  });
}

export function useUpdateProjectView(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ viewId, payload }: { viewId: string; payload: UpdateViewPayload }) =>
      updateProjectView(projectId, viewId, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: viewsKey(projectId) }),
  });
}

export function useDeleteProjectView(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (viewId: string) => deleteProjectView(projectId, viewId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: viewsKey(projectId) }),
  });
}
