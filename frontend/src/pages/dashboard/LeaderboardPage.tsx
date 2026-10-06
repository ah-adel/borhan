import { useEffect, useState } from 'react';
import { Flame, Trophy } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { useAuth } from '@/context/AuthContext';
import { useTranslation } from '@/context/I18nContext';
import { fetchLeaderboard } from '@/services/lmsRepository';
import type { LeaderboardEntry } from '@/types/lms';

export function LeaderboardPage() {
  const { session } = useAuth();
  const { t, formatNumber } = useTranslation();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    fetchLeaderboard()
      .then((result) => { if (mounted) setEntries(result); })
      .catch(() => { if (mounted) setError(t('gamification.loadError')); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [t]);

  return (
    <div className="animate-fade-in-up space-y-6">
      <header className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-warning-100 text-warning-700 dark:bg-warning-950/30 dark:text-warning-300"><Trophy className="h-5 w-5" /></div>
        <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">{t('gamification.yourPosition')}</p><h1 className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{t('gamification.leaderboard')}</h1></div>
      </header>

      {error && <div className="rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-900/50 dark:bg-error-950/20 dark:text-error-300" role="alert">{error}</div>}
      {loading ? <LoadingState label={t('common.loading')} /> : entries.length === 0 ? <EmptyState title={t('gamification.noStudents')} description={t('gamification.noStudents')} icon={<Trophy className="h-8 w-8" />} /> : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-start">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-900/70 dark:text-gray-400">
                <tr><th className="px-5 py-3 font-semibold">{t('gamification.rank')}</th><th className="px-5 py-3 font-semibold">{t('gamification.student')}</th><th className="px-5 py-3 text-end font-semibold">{t('gamification.points')}</th><th className="px-5 py-3 text-end font-semibold">{t('gamification.currentStreak')}</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {entries.map((entry) => {
                  const isCurrentUser = entry.student_id === session?.userId;
                  return <tr key={entry.student_id} className={isCurrentUser ? 'bg-primary-50/70 dark:bg-primary-950/20' : ''} aria-current={isCurrentUser ? 'true' : undefined}>
                    <td className="px-5 py-4 text-sm font-semibold text-gray-700 dark:text-gray-200">#{formatNumber(entry.rank)}</td>
                    <td className="px-5 py-4"><span className="text-sm font-medium text-gray-900 dark:text-white">{entry.full_name}</span>{isCurrentUser && <span className="ms-2 text-xs text-primary-700 dark:text-primary-300">{t('gamification.yourPosition')}</span>}</td>
                    <td className="px-5 py-4 text-end text-sm font-semibold text-gray-900 dark:text-white">{formatNumber(entry.points)}</td>
                    <td className="px-5 py-4 text-end"><span className="inline-flex items-center justify-end gap-1.5 text-sm text-gray-600 dark:text-gray-300"><Flame className="h-4 w-4 text-accent-500" />{formatNumber(entry.current_streak)}</span></td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}