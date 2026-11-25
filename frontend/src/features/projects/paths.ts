export const PROJECT_ROUTE = '/projects/:projectId';

export function projectPath(id: string): string {
  return `/projects/${encodeURIComponent(id)}`;
}
