import { type ReactNode } from 'react';
import { BrandMark } from '@/components/BrandMark';
import { ThemeToggle } from '@/components/ThemeToggle';
import { LanguageToggle } from '@/components/LanguageToggle';
import { useTranslation } from '@/context/I18nContext';

interface AuthLayoutProps {
  children: ReactNode;
  title: string;
  subtitle: string;
}

export function AuthLayout({ children, title, subtitle }: AuthLayoutProps) {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-50 via-primary-50/30 to-gray-50 px-4 py-12 dark:from-gray-950 dark:via-primary-950/20 dark:to-gray-950">
      <main className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <BrandMark className="h-10 w-10 shadow-lg shadow-primary-600/20" iconClassName="h-6 w-6 text-white" />
            <span className="text-lg font-bold tracking-tight text-gray-900 dark:text-white">
              {t('common.brandName')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </div>

        {/* Card */}
        <div className="card animate-fade-in-up p-8">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            {title}
          </h1>
          <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">
            {subtitle}
          </p>
          <div className="mt-6">{children}</div>
        </div>
      </main>
    </div>
  );
}
