import { Badge } from '@/components/ui/badge';
import type { WorkspaceVisibility } from '../api/organizationsApi';
import { visibilityLabels } from './visibility';

export function VisibilityLozenge({ visibility }: { visibility: WorkspaceVisibility }) {
  return (
    <Badge variant={visibility === 'open' ? 'secondary' : 'outline'}>
      {visibilityLabels[visibility]}
    </Badge>
  );
}
