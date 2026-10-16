import { useCallback, useRef, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Sidebar } from '@/components/dashboard/Sidebar';
import { TopBar } from '@/components/dashboard/TopBar';
import { useAuth } from '@/context/AuthContext';

export function DashboardLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const { loading, profile } = useAuth();
  const openMobile = useCallback(() => setMobileOpen(true), []);
  const closeMobile = useCallback(() => setMobileOpen(false), []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-app dark:bg-gray-950">
        <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
      </div>
    );
  }

  if (!profile) {
    return <Navigate to="/auth/sign-in" replace />;
  }

  return (
    <div className="min-h-screen bg-surface-app dark:bg-gray-950">
      <Sidebar
        mobileOpen={mobileOpen}
        onCloseMobile={closeMobile}
      />

      <div className="min-w-0 lg:ps-[275px]">
        <TopBar
          mobileOpen={mobileOpen}
          mobileMenuButtonRef={mobileMenuButtonRef}
          onOpenMobile={openMobile}
        />
        <main className="mx-auto min-w-0 w-full max-w-7xl px-4 py-6 sm:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
