import { useState } from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';
import { WorkItemDetailSurface } from './WorkItemPage';

export interface WorkItemDetailDialogProps {
  workItemId: string | null;
  onClose: () => void;
}

function WorkItemDetailDialogBody({
  workItemId,
  onClose,
}: {
  workItemId: string;
  onClose: () => void;
}) {
  const [maximized, setMaximized] = useState(false);

  return (
    <DialogPrimitive.Content
      data-slot="work-item-detail-dialog"
      data-maximized={maximized ? 'true' : 'false'}
      aria-label="Work Item details"
      className={cn(
        'fixed z-[60] flex flex-col overflow-y-auto bg-card text-card-foreground outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0',
        maximized
          ? 'inset-0 h-svh w-screen max-w-none max-h-none rounded-none border-0'
          : 'top-1/2 left-1/2 max-h-[min(88svh,820px)] w-[calc(100%-2rem)] max-w-[1040px] -translate-x-1/2 -translate-y-1/2 rounded-md border border-border shadow-card data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
      )}
    >
      <DialogPrimitive.Title className="sr-only">Work Item details</DialogPrimitive.Title>
      <DialogPrimitive.Description className="sr-only">
        View and edit Work Item details.
      </DialogPrimitive.Description>

      <WorkItemDetailSurface
        workItemId={workItemId}
        mode="dialog"
        maximized={maximized}
        onToggleMaximize={() => {
          setMaximized((prev) => !prev);
        }}
        onClose={onClose}
      />
    </DialogPrimitive.Content>
  );
}

/** Maximizable overlay dialog rendering the redesigned 01C Work Item editor over the active view. */
export function WorkItemDetailDialog({ workItemId, onClose }: WorkItemDetailDialogProps) {
  return (
    <DialogPrimitive.Root
      open={Boolean(workItemId)}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          data-slot="work-item-detail-backdrop"
          className="dialog-backdrop fixed inset-0 z-[55] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
        />
        {workItemId && (
          <WorkItemDetailDialogBody key={workItemId} workItemId={workItemId} onClose={onClose} />
        )}
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
