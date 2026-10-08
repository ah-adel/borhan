import { useEffect, useState, type FormEvent } from 'react';
import { Check, CreditCard, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useTranslation } from '@/context/I18nContext';
import {
  createSubscriptionPlan,
  deleteSubscriptionPlan,
  fetchSubscriptionPlans,
  updateSubscriptionPlan,
} from '@/services/lmsRepository';
import type { SubscriptionPlan } from '@/types/lms';

export function SubscriptionsPage() {
  const { t, formatCurrency, formatDate, formatNumber } = useTranslation();
  const { profile } = useAuth();
  const isManager = profile?.role === 'instructor' || profile?.role === 'admin';
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [planName, setPlanName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [durationDays, setDurationDays] = useState('30');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    fetchSubscriptionPlans()
      .then((result) => { if (mounted) setPlans(result); })
      .catch(() => { if (mounted) setError(t('subscription.loadError')); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [t, isManager]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!planName.trim() || !price || !durationDays || !isManager) return;
    setSaving(true);
    setError('');
    try {
      const created = await createSubscriptionPlan({
        name: planName.trim(),
        description: description.trim(),
        price: Number(price),
        duration_days: Number(durationDays),
        is_active: true,
      });
      setPlans((current) => [...current, created].sort((left, right) => Number(left.price) - Number(right.price)));
      setPlanName('');
      setDescription('');
      setPrice('');
      setDurationDays('30');
    } catch {
      setError(t('subscription.saveError'));
    } finally {
      setSaving(false);
    }
  }

  async function togglePlan(plan: SubscriptionPlan) {
    setError('');
    try {
      const updated = await updateSubscriptionPlan(plan.id, { is_active: !plan.is_active });
      setPlans((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
    } catch {
      setError(t('subscription.saveError'));
    }
  }

  async function removePlan(planId: string) {
    if (!window.confirm(t('subscription.confirmDelete'))) return;
    setError('');
    try {
      await deleteSubscriptionPlan(planId);
      setPlans((current) => current.filter((entry) => entry.id !== planId));
    } catch {
      setError(t('subscription.saveError'));
    }
  }

  return (
    <div className="animate-fade-in-up space-y-6">
      <header className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-100 text-primary-700 dark:bg-primary-950/30 dark:text-primary-300"><CreditCard className="h-5 w-5" /></div>
        <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">{isManager ? t('subscription.managePlans') : t('subscription.availablePlans')}</p><h1 className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{t('subscription.title')}</h1></div>
      </header>

      {error && <div className="rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-900/50 dark:bg-error-950/20 dark:text-error-300" role="alert">{error}</div>}

      <section aria-labelledby="active-subscriptions-title" className="space-y-3">
        <h2 id="active-subscriptions-title" className="text-lg font-semibold text-gray-900 dark:text-white">{isManager ? t('subscription.planCatalog') : t('subscription.availablePlans')}</h2>
        {loading ? <p className="text-sm text-gray-500 dark:text-gray-400" role="status">{t('common.loading')}</p> : plans.length === 0 ? <p className="rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">{t('subscription.noPlans')}</p> : (
          <div className="grid gap-4 md:grid-cols-2">
            {plans.map((plan) => <article key={plan.id} className="card p-5">
              <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.1em] text-success-700 dark:text-success-300">{plan.is_active ? t('subscription.available') : t('subscription.unavailable')}</p><h3 className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{plan.id === 'free-plan' ? t('subscription.freePlan') : plan.name}</h3></div><span className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-semibold text-gray-800 dark:bg-gray-800 dark:text-gray-100">{formatCurrency(Number(plan.price))}</span></div>
              {(plan.description || plan.id === 'free-plan') && <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">{plan.id === 'free-plan' ? t('subscription.freePlan') : plan.description}</p>}
              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="text-sm text-gray-500 dark:text-gray-400">{plan.duration_days === null ? t('subscription.unlimitedDuration') : t('subscription.durationLabel', { days: formatNumber(plan.duration_days) })}</p>
                {isManager && plan.id !== 'free-plan' && <div className="flex items-center gap-2">
                  <button type="button" className="btn-secondary px-3 py-2" onClick={() => void togglePlan(plan)} aria-label={plan.is_active ? t('subscription.deactivate') : t('subscription.activate')} title={plan.is_active ? t('subscription.deactivate') : t('subscription.activate')}>
                    <Check className="h-4 w-4" />{plan.is_active ? t('subscription.deactivate') : t('subscription.activate')}
                  </button>
                  <button type="button" className="rounded-lg p-2 text-gray-500 hover:bg-error-50 hover:text-error-700 dark:hover:bg-error-950/30 dark:hover:text-error-300" onClick={() => void removePlan(plan.id)} aria-label={t('subscription.deletePlan')} title={t('subscription.deletePlan')}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>}
              </div>
            </article>)}
          </div>
        )}
      </section>

      {isManager && <section className="space-y-4" aria-labelledby="create-plan-title">
        <div className="flex items-center gap-2"><Plus className="h-5 w-5 text-primary-600 dark:text-primary-300" /><h2 id="create-plan-title" className="text-lg font-semibold text-gray-900 dark:text-white">{t('subscription.createPlan')}</h2></div>
        <form onSubmit={(event) => void handleSubmit(event)} className="grid gap-4 rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900 sm:grid-cols-2">
          <label className="label-text">{t('subscription.planName')}<input className="input-field mt-1" value={planName} onChange={(event) => setPlanName(event.target.value)} maxLength={120} required /></label>
          <label className="label-text">{t('subscription.price')}<input className="input-field mt-1" type="number" min="0" max="99999999.99" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} required /></label>
          <label className="label-text sm:col-span-2">{t('subscription.description')}<textarea className="input-field mt-1 min-h-20" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} /></label>
          <label className="label-text">{t('subscription.durationDays')}<input className="input-field mt-1" type="number" min="1" max="36500" value={durationDays} onChange={(event) => setDurationDays(event.target.value)} required /></label>
          <div className="flex items-end"><button type="submit" className="btn-primary w-full" disabled={saving}><Plus className="h-4 w-4" />{saving ? t('common.loading') : t('subscription.createPlan')}</button></div>
        </form>
      </section>}
    </div>
  );
}