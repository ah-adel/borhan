import type { Key, ReactNode } from 'react';

export interface DataTableColumn<Row> {
  id: string;
  header: ReactNode;
  render: (row: Row) => ReactNode;
  className?: string;
  headerClassName?: string;
}

interface DataTableProps<Row> {
  ariaLabel: string;
  columns: readonly DataTableColumn<Row>[];
  rows: readonly Row[];
  getRowKey: (row: Row) => Key;
  emptyState?: ReactNode;
  loading?: boolean;
  loadingRows?: number;
  rowActions?: (row: Row) => ReactNode;
  rowActionsLabel?: ReactNode;
  stickyHeader?: boolean;
  scrollHint?: ReactNode;
  className?: string;
}

export function DataTable<Row>({
  ariaLabel,
  columns,
  rows,
  getRowKey,
  emptyState,
  loading = false,
  loadingRows = 3,
  rowActions,
  rowActionsLabel,
  stickyHeader = false,
  scrollHint,
  className = '',
}: DataTableProps<Row>) {
  const columnCount = columns.length + (rowActions ? 1 : 0);

  return (
    <div className={`min-w-0 ${className}`}>
      {scrollHint && <p className="mb-2 text-xs text-content-muted">{scrollHint}</p>}
      <div role="region" aria-label={ariaLabel} tabIndex={0} className="min-w-0 overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600">
        <table className="w-full min-w-max border-collapse text-start text-sm text-content-main">
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.id}
                  scope="col"
                  className={`whitespace-nowrap border-b border-border bg-gray-50 p-4 text-start text-xs font-semibold uppercase text-content-muted dark:bg-gray-800/70 ${stickyHeader ? 'sticky top-0 z-10' : ''} ${column.headerClassName ?? ''}`}
                >
                  {column.header}
                </th>
              ))}
              {rowActions && (
                <th
                  scope="col"
                  className={`whitespace-nowrap border-b border-border bg-gray-50 p-4 text-start text-xs font-semibold uppercase text-content-muted dark:bg-gray-800/70 ${stickyHeader ? 'sticky top-0 z-10' : ''}`}
                >
                  {rowActionsLabel}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {loading && Array.from({ length: Math.max(1, loadingRows) }, (_, index) => (
              <tr key={`loading-${index}`} aria-hidden="true">
                {Array.from({ length: columnCount }, (_, cellIndex) => (
                  <td key={cellIndex} className="border-b border-border p-4">
                    <span className="block h-4 w-3/4 animate-pulse rounded bg-gray-200 motion-reduce:animate-none dark:bg-gray-700" />
                  </td>
                ))}
              </tr>
            ))}
            {!loading && rows.map((row) => (
              <tr key={getRowKey(row)} className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/40">
                {columns.map((column) => (
                  <td key={column.id} className={`border-b border-border p-4 align-middle ${column.className ?? ''}`}>
                    {column.render(row)}
                  </td>
                ))}
                {rowActions && <td className="border-b border-border p-4 align-middle">{rowActions(row)}</td>}
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={columnCount} className="border-b border-border p-8 text-center text-sm text-content-muted">
                  {emptyState}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}