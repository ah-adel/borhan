import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { useTranslation } from '@/context/I18nContext';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  pageSize: number;
  pageSizeOptions: number[];
  onPageSizeChange: (pageSize: number) => void;
}

function getPageItems(currentPage: number, totalPages: number): Array<number | 'start-gap' | 'end-gap'> {
  const visiblePages = Array.from(new Set([1, currentPage - 1, currentPage, currentPage + 1, totalPages]))
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((left, right) => left - right);
  const items: Array<number | 'start-gap' | 'end-gap'> = [];

  visiblePages.forEach((page, index) => {
    const previousPage = visiblePages[index - 1];
    if (previousPage != null && page - previousPage > 1) {
      items.push(index === 1 ? 'start-gap' : 'end-gap');
    }
    items.push(page);
  });

  return items;
}

export function Pagination({ currentPage, totalPages, onPageChange, pageSize, pageSizeOptions, onPageSizeChange }: PaginationProps) {
  const { t, direction } = useTranslation();
  const pageCount = Math.max(1, totalPages);
  const page = Math.min(Math.max(1, currentPage), pageCount);
  const PreviousIcon = direction === 'rtl' ? ChevronRight : ChevronLeft;
  const NextIcon = direction === 'rtl' ? ChevronLeft : ChevronRight;

  return (
    <nav aria-label={t('common.pagination')} className="flex min-w-0 flex-wrap items-center justify-between gap-3 py-3">
      <div className="flex min-w-0 flex-wrap items-center gap-1">
        <Button
          iconOnly
          variant="ghost"
          aria-label={t('common.previous')}
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
        >
          <PreviousIcon className="h-4 w-4" aria-hidden="true" />
        </Button>
        {getPageItems(page, pageCount).map((item) => typeof item === 'number' ? (
          <Button
            key={item}
            variant={item === page ? 'primary' : 'ghost'}
            aria-current={item === page ? 'page' : undefined}
            aria-label={t('common.goToPage', { page: item })}
            onClick={() => onPageChange(item)}
          >
            {item}
          </Button>
        ) : (
          <span key={item} aria-hidden="true" className="px-1 text-content-muted">...</span>
        ))}
        <Button
          iconOnly
          variant="ghost"
          aria-label={t('common.next')}
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pageCount}
        >
          <NextIcon className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <span className="whitespace-nowrap text-sm text-content-muted">{t('common.pageStatus', { page, pages: pageCount })}</span>
        <Select
          aria-label={t('common.rowsPerPage')}
          value={pageSize}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
          className="min-h-11 w-auto min-w-24"
        >
          {pageSizeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
        </Select>
      </div>
    </nav>
  );
}