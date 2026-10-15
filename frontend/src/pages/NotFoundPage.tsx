import { useEffect } from 'react';
import { ArrowLeft, ArrowRight, Home, LayoutDashboard } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from '@/context/I18nContext';

export function NotFoundPage() {
  const { t, direction } = useTranslation();
  const BackArrow = direction === 'rtl' ? ArrowRight : ArrowLeft;

  useEffect(() => {
    document.title = t('notFound.pageTitle');
  }, [t]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12 text-gray-900 dark:bg-gray-950 dark:text-white">
      <div className="w-full max-w-xl text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-100 text-primary-700 dark:bg-primary-950/50 dark:text-primary-300">
          <Home className="h-7 w-7" aria-hidden="true" />
        </div>
        <p className="mt-8 text-sm font-semibold uppercase text-primary-700 dark:text-primary-300">404</p>
        <h1 className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{t('notFound.title')}</h1>
        <p className="mx-auto mt-4 max-w-md text-gray-600 dark:text-gray-300">{t('notFound.description')}</p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link to="/" className="btn-primary">
            <BackArrow className="h-4 w-4" aria-hidden="true" />
            {t('notFound.home')}
          </Link>
          <Link to="/dashboard" className="btn-secondary">
            <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
            {t('notFound.dashboard')}
          </Link>
        </div>
      </div>
    </main>
  );
}