import type { UseQueryResult } from '@tanstack/react-query';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { errorMessage } from '../../../shared/api/httpClient';
import type { Page } from '../api/organizationsApi';

interface ListPanelProps<T> {
  title: string;
  query: UseQueryResult<Page<T>>;
  emptyTitle: string;
  emptyDescription: string;
  /** Shown at the end of the panel's header. */
  action?: ReactNode;
  /** Shown between the header and the list. */
  form?: ReactNode;
  renderItem: (item: T) => ReactNode;
  onPageChange: (page: number) => void;
}

/** A titled panel with one page of a collection and its loading, error and empty states. */
export function ListPanel<T>({ title, query, action, form, ...list }: ListPanelProps<T>) {
  const titleId = useId();
  return (
    <Card className="overflow-hidden" aria-labelledby={titleId}>
      <CardHeader>
        <CardTitle id={titleId}>{title}</CardTitle>
        {action && <div className="ms-auto">{action}</div>}
      </CardHeader>
      {form}
      <ListBody query={query} {...list} />
    </Card>
  );
}

type ListBodyProps<T> = Pick<
  ListPanelProps<T>,
  'query' | 'emptyTitle' | 'emptyDescription' | 'renderItem' | 'onPageChange'
>;

function ListBody<T>({
  query,
  emptyTitle,
  emptyDescription,
  renderItem,
  onPageChange,
}: ListBodyProps<T>) {
  if (query.isPending) {
    return (
      <CardContent>
        <span
          role="status"
          aria-label="Loading"
          className="inline-flex items-center text-muted-foreground"
        >
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        </span>
      </CardContent>
    );
  }
  if (query.isError) {
    return (
      <CardContent>
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertDescription role="alert">{errorMessage(query.error)}</AlertDescription>
        </Alert>
      </CardContent>
    );
  }
  if (query.data.items.length === 0) {
    return (
      <div className="grid gap-1 px-6 py-8 text-center">
        <h3 className="text-sm font-medium text-foreground">{emptyTitle}</h3>
        <p className="text-sm text-muted-foreground">{emptyDescription}</p>
      </div>
    );
  }
  return (
    <>
      <ul className="m-0 list-none divide-y p-0">{query.data.items.map(renderItem)}</ul>
      <ListPager
        page={query.data.page}
        totalPages={query.data.totalPages}
        onPageChange={onPageChange}
      />
    </>
  );
}

interface ListPagerProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

function ListPager({ page, totalPages, onPageChange }: ListPagerProps) {
  if (totalPages <= 1) {
    return null;
  }
  return (
    <CardFooter>
      <span>
        Page {page} of {totalPages}
      </span>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => {
            onPageChange(page - 1);
          }}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => {
            onPageChange(page + 1);
          }}
        >
          Next
        </Button>
      </div>
    </CardFooter>
  );
}
