import { useEffect, useState } from 'react';
import { CalendarClock, CreditCard, RefreshCw } from 'lucide-react';
import { useTranslation } from '@/context/I18nContext';
import { createOrRenewSubscription, fetchMySubscriptions } from '@/services/lmsRepository';
import type { Subscription } from '@/types/lms';

export function SubscriptionsPage() {
  const { t, formatCurrency, formatDate, formatNumber } = useTranslation();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [planName, setPlanName] = useState('');
  const [price, setPrice] = useState('');
  const [durationDays, setDurationDays] = useState('30');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let mounted = true;
    fetchMySubscriptions()
      .then((result) => { if (mounted) setSubscriptions(result); })
      .catch(() => { if (mounted) setError(t('subscription.loadError')); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [t]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!planName.trim() || !price || !durationDays) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await createOrRenewSubscription({
        plan_name: planName.trim(),
        price: Number(price),
        duration_days: Number(durationDays),
      });
      setSubscriptions(await fetchMySubscriptions());
      setNotice(t('subscription.created'));
    } catch {
      setError(t('subscription.saveError'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="animate-fade-in-up space-y-6">
      <header className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-100 text-primary-700 dark:bg-primary-950/30 dark:text-primary-300"><CreditCard className="h-5 w-5" /></div>
        <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">{t('subscription.activePlan')}</p><h1 className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{t('subscription.title')}</h1></div>
      </header>

      {error && <div className="rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-900/50 dark:bg-error-950/20 dark:text-error-300" role="alert">{error}</div>}
      {notice && <div className="rounded-lg border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-800 dark:border-success-900/50 dark:bg-success-950/20 dark:text-success-200" role="status">{notice}</div>}

      <section aria-labelledby="active-subscriptions-title" className="space-y-3">
        <h2 id="active-subscriptions-title" className="text-lg font-semibold text-gray-900 dark:text-white">{t('subscription.activePlan')}</h2>
        {loading ? <p className="text-sm text-gray-500 dark:text-gray-400" role="status">{t('common.loading')}</p> : subscriptions.length === 0 ? <p className="rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">{t('subscription.noActivePlan')}</p> : (
          <div className="grid gap-4 md:grid-cols-2">
            {subscriptions.map((subscription) => <article key={subscription.id} className="card p-5">
              <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.1em] text-success-700 dark:text-success-300">{t(`common.${subscription.status === 'active' ? 'active' : 'inactive'}`)}</p><h3 className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{subscription.plan_name}</h3></div><span className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-semibold text-gray-800 dark:bg-gray-800 dark:text-gray-100">{formatCurrency(Number(subscription.price))}</span></div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-gray-500 dark:text-gray-400">{t('subscription.startDate')}</dt><dd className="mt-1 font-medium text-gray-800 dark:text-gray-200">{formatDate(subscription.start_date, { dateStyle: 'medium' })}</dd></div><div><dt className="text-xs text-gray-500 dark:text-gray-400">{t('subscription.endDate')}</dt><dd className="mt-1 font-medium text-gray-800 dark:text-gray-200">{formatDate(subscription.end_date, { dateStyle: 'medium' })}</dd></div><div><dt className="text-xs text-gray-500 dark:text-gray-400">{t('subscription.durationDays')}</dt><dd className="mt-1 font-medium text-gray-800 dark:text-gray-200">{formatNumber(subscription.duration_days)}</dd></div><div><dt className="text-xs text-gray-500 dark:text-gray-400">{t('subscription.status')}</dt><dd className="mt-1 font-medium capitalize text-gray-800 dark:text-gray-200">{subscription.status}</dd></div></dl>
            </article>)}
          </div>
        )}
      </section>

      <section className="card p-5" aria-labelledby="renew-subscription-title">
        <div className="flex items-start gap-3"><CalendarClock className="mt-0.5 h-5 w-5 text-primary-600 dark:text-primary-300" /><div><h2 id="renew-subscription-title" className="text-lg font-semibold text-gray-900 dark:text-white">{t('subscription.createOrRenew')}</h2><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('subscription.billingNotice')}</p></div></div>
        <form onSubmit={(event) => void handleSubmit(event)} className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="label-text sm:col-span-2 lg:col-span-1">{t('subscription.planName')}<input className="input-field mt-1" value={planName} onChange={(event) => setPlanName(event.target.value)} maxLength={120} required /></label>
          <label className="label-text">{t('subscription.price')}<input className="input-field mt-1" type="number" min="0" max="99999999.99" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} required /></label>
          <label className="label-text">{t('subscription.durationDays')}<input className="input-field mt-1" type="number" min="1" max="36500" value={durationDays} onChange={(event) => setDurationDays(event.target.value)} required /></label>
          <div className="flex items-end"><button type="submit" className="btn-primary w-full" disabled={saving}><RefreshCw className={`h-4 w-4 ${saving ? 'animate-spin' : ''}`} />{t('subscription.renew')}</button></div>
        </form>
      </section>
    </div>
  );
}