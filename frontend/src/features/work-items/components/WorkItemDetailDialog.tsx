import { useRef, useState, type PointerEvent } from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';
import { WorkItemDetailSurface } from './WorkItemPage';

const MIN_DIALOG_HEIGHT = 320;
const VIEWPORT_PADDING = 16;

interface VerticalBounds {
  top: number;
  height: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function computeNextBounds(
  edge: 'top' | 'bottom',
  start: VerticalBounds,
  deltaY: number,
  viewportHeight: number,
): VerticalBounds {
  const maxHeight = Math.max(MIN_DIALOG_HEIGHT, viewportHeight - VIEWPORT_PADDING * 2);
  if (edge === 'bottom') {
    const allowedMax = Math.max(MIN_DIALOG_HEIGHT, viewportHeight - start.top - VIEWPORT_PADDING);
    return {
      top: start.top,
      height: clamp(start.height + deltaY, MIN_DIALOG_HEIGHT, Math.min(maxHeight, allowedMax)),
    };
  }
  const bottom = start.top + start.height;
  const minTop = Math.max(VIEWPORT_PADDING, bottom - maxHeight);
  const maxTop = bottom - MIN_DIALOG_HEIGHT;
  const nextTop = clamp(start.top + deltaY, minTop, maxTop);
  return {
    top: nextTop,
    height: bottom - nextTop,
  };
}

function useDialogVerticalResize(contentRef: React.RefObject<HTMLDivElement | null>) {
  const [bounds, setBounds] = useState<VerticalBounds | null>(null);

  function startResize(edge: 'top' | 'bottom', event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    const viewportHeight = window.innerHeight || 900;
    const rect = contentRef.current?.getBoundingClientRect();
    const initial: VerticalBounds =
      bounds ??
      (rect && rect.height > 0
        ? { top: rect.top, height: rect.height }
        : { top: Math.round(viewportHeight * 0.1), height: Math.round(viewportHeight * 0.8) });
    const startY = event.clientY;

    function handleMove(moveEvent: globalThis.PointerEvent) {
      setBounds(
        computeNextBounds(edge, initial, moveEvent.clientY - startY, window.innerHeight || 900),
      );
    }

    function handleUp() {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    }

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  }

  return { bounds, startResize };
}

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
  const contentRef = useRef<HTMLDivElement>(null);
  const { bounds, startResize } = useDialogVerticalResize(contentRef);

  const customStyle =
    !maximized && bounds
      ? { top: `${String(bounds.top)}px`, height: `${String(bounds.height)}px` }
      : undefined;

  return (
    <DialogPrimitive.Content
      ref={contentRef}
      data-slot="work-item-detail-dialog"
      data-maximized={maximized ? 'true' : 'false'}
      aria-label="Work Item details"
      style={customStyle}
      className={cn(
        'fixed z-[60] flex flex-col overflow-hidden bg-card text-card-foreground outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0',
        maximized
          ? 'inset-0 h-svh w-screen max-w-none max-h-none rounded-none border-0'
          : 'top-[10svh] left-1/2 h-[80svh] w-[80vw] max-w-none -translate-x-1/2 rounded-md border border-border shadow-card data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
      )}
    >
      <DialogPrimitive.Title className="sr-only">Work Item details</DialogPrimitive.Title>
      <DialogPrimitive.Description className="sr-only">
        View and edit Work Item details.
      </DialogPrimitive.Description>

      {!maximized && (
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize card top border"
          data-slot="work-item-resize-top"
          onPointerDown={(event) => {
            startResize('top', event);
          }}
          className="group absolute inset-x-0 top-0 z-10 flex h-2 cursor-ns-resize items-center justify-center"
        >
          <span className="h-0.5 w-12 rounded-full bg-transparent transition-colors group-hover:bg-primary/60" />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <WorkItemDetailSurface
          workItemId={workItemId}
          mode="dialog"
          maximized={maximized}
          onToggleMaximize={() => {
            setMaximized((prev) => !prev);
          }}
          onClose={onClose}
        />
      </div>

      {!maximized && (
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize card bottom border"
          data-slot="work-item-resize-bottom"
          onPointerDown={(event) => {
            startResize('bottom', event);
          }}
          className="group absolute inset-x-0 bottom-0 z-10 flex h-2 cursor-ns-resize items-center justify-center"
        >
          <span className="h-0.5 w-12 rounded-full bg-transparent transition-colors group-hover:bg-primary/60" />
        </div>
      )}
    </DialogPrimitive.Content>
  );
}

/** Maximizable and vertically resizable overlay dialog rendering the 01C Work Item editor. */
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
