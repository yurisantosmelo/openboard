const STORAGE_KEY = 'openboard:nav-context';
const CONTEXT_EVENT = 'openboard:nav-context-changed';

export interface NavigationContext {
  userId?: string;
  organizationId?: string;
  organizationName?: string;
  workspaceId?: string;
  workspaceName?: string;
  projectId?: string;
  projectName?: string;
}

export function readNavigationContext(userId?: string): NavigationContext {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as NavigationContext;
    if (userId && parsed.userId && parsed.userId !== userId) {
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}

export function saveNavigationContext(patch: NavigationContext): void {
  try {
    const current = readNavigationContext(patch.userId);
    const next: NavigationContext = { ...current, ...patch };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(CONTEXT_EVENT));
  } catch {
    // Ignore storage quota or private mode errors.
  }
}

export function clearNavigationContext(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event(CONTEXT_EVENT));
  } catch {
    // Ignore storage errors.
  }
}

export function subscribeNavigationContext(listener: () => void): () => void {
  window.addEventListener(CONTEXT_EVENT, listener);
  return () => {
    window.removeEventListener(CONTEXT_EVENT, listener);
  };
}
