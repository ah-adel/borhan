import { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { GraduationCap, X } from 'lucide-react';
import { getNavItemsForRole } from '@/config/navigation';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';
import { useScrollLock } from '@/hooks/useScrollLock';

interface SidebarProps {
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({ mobileOpen, onCloseMobile }: SidebarProps) {
  const { profile } = useAuth();
  const { t, direction } = useI18n();
  const navItems = getNavItemsForRole(profile?.role);
  const mobileTranslate = mobileOpen ? 'translate-x-0' : direction === 'rtl' ? 'translate-x-full' : '-translate-x-full';
  const [isDrawerViewport, setIsDrawerViewport] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches,
  );
  const drawerRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const isDrawerOpen = mobileOpen && isDrawerViewport;

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 1023px)');
    const updateViewport = () => setIsDrawerViewport(mediaQuery.matches);
    updateViewport();
    mediaQuery.addEventListener('change', updateViewport);
    return () => mediaQuery.removeEventListener('change', updateViewport);
  }, []);

  useEffect(() => {
    drawerRef.current?.toggleAttribute('inert', isDrawerViewport && !mobileOpen);
  }, [isDrawerViewport, mobileOpen]);

  useEffect(() => {
    if (!isDrawerOpen) return undefined;

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();

    function handleDrawerKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseMobile();
        return;
      }

      if (event.key !== 'Tab') return;
      const focusableElements = Array.from(
        drawerRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      if (!firstElement || !lastElement) {
        event.preventDefault();
        drawerRef.current?.focus();
      } else if (event.shiftKey && (document.activeElement === firstElement || !drawerRef.current?.contains(document.activeElement))) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && (document.activeElement === lastElement || !drawerRef.current?.contains(document.activeElement))) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    document.addEventListener('keydown', handleDrawerKeydown);
    return () => {
      document.removeEventListener('keydown', handleDrawerKeydown);
      if (window.matchMedia('(max-width: 1023px)').matches && previousFocus?.isConnected) {
        previousFocus.focus();
      }
    };
  }, [isDrawerOpen, onCloseMobile]);

  useScrollLock(isDrawerOpen);

  const displayName = profile?.full_name || t('common.user');
  const profileInitials = (profile?.full_name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase();
  const roleName = profile?.role === 'student'
    ? t('common.studentRole')
    : profile?.role === 'instructor'
      ? t('common.instructorRole')
      : t('common.adminRole');

  return (
    <>
      {isDrawerOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
          style={{ overscrollBehavior: 'contain' }}
        />
      )}

      <aside
        id="dashboard-navigation"
        ref={drawerRef}
        role={isDrawerOpen ? 'dialog' : undefined}
        aria-label={isDrawerOpen ? t('common.navigationMenu') : undefined}
        aria-modal={isDrawerOpen ? true : undefined}
        aria-hidden={isDrawerViewport && !mobileOpen ? true : undefined}
        className={`fixed inset-y-0 start-0 z-40 flex w-[275px] max-w-[calc(100vw-2rem)] flex-col border-e border-border bg-surface-card transition-transform duration-150 ease-in-out motion-reduce:transition-none dark:bg-surface-card lg:translate-x-0 ${mobileTranslate}`}
        style={{ overscrollBehavior: 'contain' }}
      >
        <div className="flex h-[72px] shrink-0 items-center justify-between border-b border-border px-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-600">
              <GraduationCap className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg font-bold text-content-main">
              {t('common.brandName')}
            </span>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onCloseMobile}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200 lg:hidden"
            aria-label={t('nav.closeSidebar')}
            tabIndex={isDrawerViewport ? undefined : -1}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {profile && (
          <div className="shrink-0 px-4 pt-4">
            <div className="flex min-w-0 items-center gap-3 rounded-xl bg-gray-50 p-3 dark:bg-gray-800/70">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-100 text-sm font-semibold text-primary-700 dark:bg-primary-900/60 dark:text-primary-200">
                {profileInitials || '?'}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-content-main">{displayName}</p>
                <p className="mt-0.5 truncate text-xs text-content-muted">{roleName}</p>
              </div>
            </div>
          </div>
        )}

        <nav className="sidebar-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain px-3 py-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/dashboard' || item.path === '/admin'}
                onClick={onCloseMobile}
                className={({ isActive }) =>
                  `group relative flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-primary-50 text-primary-700 before:absolute before:inset-y-2 before:start-0 before:w-1 before:rounded-e-full before:bg-primary-600 dark:bg-primary-950/40 dark:text-primary-300'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      className={`h-5 w-5 flex-shrink-0 transition-colors ${
                        isActive
                          ? 'text-primary-600 dark:text-primary-400'
                          : 'text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300'
                      }`}
                    />
                    {t(`nav.${item.labelKey}`)}
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
