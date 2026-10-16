import { useState, useRef, useEffect } from 'react';
import type { RefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, LogOut, User as UserIcon, ChevronDown, Bell } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { LanguageToggle } from '@/components/LanguageToggle';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';

interface TopBarProps {
  mobileOpen: boolean;
  mobileMenuButtonRef: RefObject<HTMLButtonElement>;
  onOpenMobile: () => void;
}

export function TopBar({ mobileOpen, mobileMenuButtonRef, onOpenMobile }: TopBarProps) {
  const { profile, signOut } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const initials = (profile?.full_name ?? '?')
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <header className="sticky top-0 z-20 flex h-[72px] min-w-0 items-center justify-between border-b border-border bg-surface-card px-6 shadow-[0_4px_30px_rgba(15,23,42,0.05)] dark:shadow-none">
      <button
        ref={mobileMenuButtonRef}
        type="button"
        onClick={onOpenMobile}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200 lg:hidden"
        aria-label={t('nav.openSidebar')}
        aria-expanded={mobileOpen}
        aria-controls="dashboard-navigation"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="ms-auto flex min-w-0 items-center gap-2">
        <LanguageToggle />
        <ThemeToggle />

        <button
          type="button"
          className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          aria-label={t('common.notifications')}
          title={t('common.notifications')}
        >
          <Bell className="h-5 w-5" aria-hidden="true" />
          <span className="absolute end-2 top-2 h-2 w-2 rounded-full bg-error-500 ring-2 ring-white dark:ring-gray-900" aria-hidden="true" />
        </button>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg pe-2 ps-1.5 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label={`${initials} ${profile?.full_name ?? t('common.user')}, ${t('common.userMenu')}`}
            aria-expanded={menuOpen}
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-600 text-xs font-semibold text-white">
              {initials}
            </div>
            <span className="hidden text-sm font-medium text-gray-700 dark:text-gray-200 sm:block">
              {profile?.full_name ?? t('common.user')}
            </span>
            <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
          </button>

          {menuOpen && (
            <div className="absolute end-0 mt-2 max-h-[70vh] w-56 origin-top-right overflow-y-auto rounded-xl border border-border bg-surface-card py-1.5 shadow-lg shadow-gray-900/5 animate-scale-in overscroll-contain rtl:origin-top-left dark:shadow-gray-950/30">
              <div className="border-b border-gray-100 px-4 py-2.5 dark:border-gray-700">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  {profile?.full_name ?? t('common.user')}
                </p>
                <p className="mt-0.5 truncate text-xs text-gray-400 dark:text-gray-500">
                  {profile?.role === 'student'
                    ? t('common.studentRole')
                    : profile?.role === 'instructor'
                      ? t('common.instructorRole')
                      : profile?.role === 'admin'
                        ? t('common.adminRole')
                        : ''}
                </p>
              </div>

              <button
                onClick={() => {
                  setMenuOpen(false);
                  navigate('/settings');
                }}
                className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700/50"
              >
                <UserIcon className="h-4 w-4 text-gray-400" />
                {t('nav.profileSettings')}
              </button>

              <div className="my-1 border-t border-gray-100 dark:border-gray-700" />

              <button
                onClick={() => {
                  setMenuOpen(false);
                  void signOut();
                }}
                className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-error-600 transition-colors hover:bg-error-50 dark:text-error-400 dark:hover:bg-error-950/30"
              >
                <LogOut className="h-4 w-4" />
                {t('nav.signOut')}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
