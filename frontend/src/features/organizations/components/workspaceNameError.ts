import { ApiError } from '../../../shared/api/httpClient';

/** The message for a Workspace name field, when a failure concerns the name. */
export function workspaceNameError(error: unknown): string | undefined {
  if (!(error instanceof ApiError)) {
    return undefined;
  }
  if (error.status === 409) {
    return 'Another Workspace in this Organization already uses this name.';
  }
  return error.problem?.errors?.find(({ field }) => field === 'name')?.message;
}
