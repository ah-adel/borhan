import { ArrowRight, BookOpenText, Calculator, Check, GraduationCap, Target } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useTranslation, type TranslationKey } from '@/context/I18nContext';
import { LanguageToggle } from '@/components/LanguageToggle';
import { ThemeToggle } from '@/components/ThemeToggle';
import { apiRequest } from '@/services/api';

const features: { icon: typeof BookOpenText; titleKey: TranslationKey; descriptionKey: TranslationKey }[] = [
  {
    icon: BookOpenText,
    titleKey: 'landingCopy.organizedLessons',
    descriptionKey: 'landingCopy.organizedLessonsDescription',
  },
  {
    icon: GraduationCap,
    titleKey: 'landingCopy.clearExplanations',
    descriptionKey: 'landingCopy.clearExplanationsDescription',
  },
  {
    icon: Target,
    titleKey: 'landingCopy.practicalPractice',
    descriptionKey: 'landingCopy.practicalPracticeDescription',
  },
];

type PublicPlatformStats = {
  active_learners?: number;
  course_completion_rate?: number | null;
  average_satisfaction?: number | null;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function parsePublicPlatformStats(value: unknown): PublicPlatformStats | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;

  const data = value as Record<string, unknown>;
  return {
    active_learners: isFiniteNumber(data.active_learners) && data.active_learners >= 0
      ? data.active_learners
      : undefined,
    course_completion_rate: data.course_completion_rate === null || (
      isFiniteNumber(data.course_completion_rate) && data.course_completion_rate >= 0 && data.course_completion_rate <= 100
    )
      ? data.course_completion_rate
      : undefined,
    average_satisfaction: data.average_satisfaction === null || (
      isFiniteNumber(data.average_satisfaction) && data.average_satisfaction >= 0 && data.average_satisfaction <= 5
    )
      ? data.average_satisfaction
      : undefined,
  };
}

export function LandingPage() {
  const { t, formatNumber } = useTranslation();
  const [stats, setStats] = useState<PublicPlatformStats | null>(null);

  useEffect(() => {
    let isCurrent = true;
    void apiRequest<unknown>('/api/platform/stats')
      .then((data) => {
        if (isCurrent) setStats(parsePublicPlatformStats(data));
      })
      .catch(() => {
        if (isCurrent) setStats(null);
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  const statItems: { value: string; labelKey: TranslationKey }[] = [];
  if (stats?.active_learners !== undefined) {
    statItems.push({ value: formatNumber(stats.active_learners), labelKey: 'landing.activeLearners' });
  }
  if (stats?.course_completion_rate !== undefined) {
    statItems.push({
      value: stats.course_completion_rate === null ? '—' : `${formatNumber(stats.course_completion_rate)}%`,
      labelKey: 'landing.completionRate',
    });
  }
  if (stats?.average_satisfaction !== undefined) {
    statItems.push({
      value: stats.average_satisfaction === null ? '—' : `${formatNumber(stats.average_satisfaction)}/5`,
      labelKey: 'landing.satisfaction',
    });
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 antialiased dark:bg-gray-950 dark:text-white">
      <header className="sticky top-0 z-40 border-b border-gray-200/80 bg-white/80 backdrop-blur-xl dark:border-gray-800 dark:bg-gray-950/75">
        <nav className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:gap-x-4 sm:px-6 sm:py-4 lg:px-8">
          <Link to="/" className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary-600 to-violet-600 text-lg font-bold text-white shadow-lg shadow-primary-500/20">
              L
            </div>
            <div>
              <div className="text-base font-semibold tracking-tight">{t('common.brandName')}</div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                {t('landing.learningPlatform')}
              </div>
            </div>
          </Link>

          <div className="flex items-center gap-1 sm:gap-2">
            <LanguageToggle className="shrink-0" />
            <ThemeToggle />
          </div>

          <div className="col-span-2 flex items-center justify-end gap-2 sm:col-span-1 sm:justify-self-end">
            <Link to="/auth/sign-in" className="btn-secondary">
              {t('landing.signIn')}
            </Link>
            <Link to="/auth/sign-up" className="btn-primary">
              {t('landing.signUp')}
            </Link>
          </div>
        </nav>
      </header>

      <main>
        <section className="relative">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.12),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(168,85,247,0.12),_transparent_25%)]" />
          <div className="relative mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[minmax(0,1.12fr)_minmax(0,0.88fr)] lg:px-8 lg:py-24">
            <div className="flex min-w-0 flex-col justify-center">
              <div className="mb-6 inline-flex w-fit items-center gap-2 rounded-full border border-primary-200 bg-primary-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-primary-700 dark:border-primary-800 dark:bg-primary-950/30 dark:text-primary-300">
                <GraduationCap className="h-3.5 w-3.5" />
                {t('landingCopy.eyebrow')}
              </div>

              <h1 className="max-w-xl break-words text-4xl font-black tracking-tight text-gray-950 dark:text-white sm:text-5xl lg:text-6xl">
                {t('landingCopy.headline')}
              </h1>

              <p className="mt-6 max-w-xl break-words text-lg text-gray-600 dark:text-gray-300">
                {t('landingCopy.description')}
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link to="/auth/sign-up" className="btn-primary">
                  {t('landing.startLearning')}
                  <ArrowRight className="directional-icon h-4 w-4" />
                </Link>
                <Link to="/auth/sign-in" className="btn-secondary">
                  {t('landing.existingAccount')}
                </Link>
              </div>

              {statItems.length > 0 && (
                <div className="mt-10 grid gap-4 sm:grid-cols-3">
                  {statItems.map((stat) => (
                    <div key={stat.labelKey} className="min-w-0 rounded-2xl border border-gray-200 bg-white/80 p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900/80">
                      <div className="text-2xl font-bold text-gray-900 dark:text-white">{stat.value}</div>
                      <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t(stat.labelKey)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="relative min-w-0">
              <div className="absolute start-0 top-10 h-24 w-24 rounded-full bg-primary-400/20 blur-3xl dark:bg-primary-500/20" />
              <div className="absolute end-0 bottom-0 h-28 w-28 rounded-full bg-violet-400/20 blur-3xl dark:bg-violet-500/20" />

              <div className="relative min-w-0 rounded-[28px] border border-gray-200 bg-white p-4 shadow-[0_30px_80px_rgba(15,23,42,0.12)] dark:border-gray-800 dark:bg-gray-950">
                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">
                        {t('landingCopy.learningPath')}
                      </p>
                      <h2 className="mt-2 text-xl font-bold text-gray-900 dark:text-white">{t('landingCopy.pathTitle')}</h2>
                    </div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100 text-primary-600 dark:bg-primary-950/40 dark:text-primary-300">
                      <Calculator className="h-5 w-5" />
                    </div>
                  </div>

                  <div className="mt-6 space-y-4">
                    <div className="rounded-2xl bg-primary-600 p-4 text-white shadow-lg shadow-primary-500/20">
                      <p className="text-xs font-semibold uppercase text-primary-100">{t('landingCopy.pathLabel')}</p>
                      <p className="mt-3 text-lg font-bold">{t('landingCopy.pathDescription')}</p>
                    </div>

                    <div className="space-y-3">
                      {([
                        { labelKey: 'landingCopy.understandStep', valueKey: 'landingCopy.conceptValue' },
                        { labelKey: 'landingCopy.practiceStep', valueKey: 'landingCopy.practiceValue' },
                        { labelKey: 'landingCopy.reviewStep', valueKey: 'landingCopy.reviewValue' },
                      ] as { labelKey: TranslationKey; valueKey: TranslationKey }[]).map((row) => (
                        <div key={row.labelKey} className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl border border-gray-200 bg-white px-3 py-2.5 dark:border-gray-800 dark:bg-gray-950">
                          <span className="min-w-0 break-words text-sm text-gray-600 dark:text-gray-300">{t(row.labelKey)}</span>
                          <span className="min-w-0 break-words font-semibold text-gray-900 dark:text-white">{t(row.valueKey)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-600 dark:text-primary-300">{t('landingCopy.featuresEyebrow')}</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
              {t('landingCopy.featuresHeading')}
            </h2>
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-3">
            {features.map(({ icon: Icon, titleKey, descriptionKey }) => (
              <div key={titleKey} className="card p-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-100 text-primary-600 dark:bg-primary-950/40 dark:text-primary-300">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-5 text-xl font-semibold text-gray-900 dark:text-white">{t(titleKey)}</h3>
                <p className="mt-3 text-gray-600 dark:text-gray-300">{t(descriptionKey)}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-y border-gray-200 bg-white/70 dark:border-gray-800 dark:bg-gray-950/40">
          <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-600 dark:text-primary-300">
                  {t('landingCopy.studyAreas')}
                </p>
                <h2 className="mt-3 text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                  {t('landingCopy.studyAreasHeading')}
                </h2>
              </div>
              <div className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-300">
                <Check className="h-4 w-4" />
                {t('landingCopy.forPreUniversity')}
              </div>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {([
                { titleKey: 'landingCopy.mathFoundations', descriptionKey: 'landingCopy.mathFoundationsDescription', icon: BookOpenText },
                { titleKey: 'landingCopy.quantitativeAptitude', descriptionKey: 'landingCopy.quantitativeAptitudeDescription', icon: Calculator },
                { titleKey: 'landingCopy.steadyProgress', descriptionKey: 'landingCopy.steadyProgressDescription', icon: Target },
              ] as { titleKey: TranslationKey; descriptionKey: TranslationKey; icon: typeof BookOpenText }[]).map(({ titleKey, descriptionKey, icon: Icon }) => (
                <div key={titleKey} className="rounded-2xl border border-gray-200 bg-gray-50 p-5 dark:border-gray-800 dark:bg-gray-900/70">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-primary-600 shadow-sm dark:bg-gray-950 dark:text-primary-300">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-5 text-lg font-semibold text-gray-900 dark:text-white">{t(titleKey)}</h3>
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{t(descriptionKey)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="rounded-[28px] border border-primary-200 bg-gradient-to-br from-primary-600 via-violet-600 to-primary-700 p-8 text-white shadow-2xl shadow-primary-500/20 sm:p-10 lg:p-12">
            <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0 max-w-2xl">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary-100">{t('landingCopy.ctaEyebrow')}</p>
                <h2 className="mt-3 break-words text-3xl font-bold tracking-tight sm:text-4xl">
                  {t('landingCopy.ctaHeading')}
                </h2>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Link to="/auth/sign-up" className="btn-primary bg-white text-primary-700 hover:bg-gray-100 dark:bg-white dark:text-primary-700">
                  {t('landing.createAccount')}
                </Link>
                <Link to="/auth/sign-in" className="btn-secondary border-white/30 bg-white/10 text-white hover:bg-white/15 dark:border-white/30 dark:bg-white/10 dark:text-white">
                  {t('landing.signIn')}
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-8 text-sm text-gray-500 dark:text-gray-400 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex items-center gap-2 font-medium text-gray-700 dark:text-gray-200">
            <Check className="h-4 w-4 text-emerald-500" />
            {t('common.brandName')}
          </div>
          <div>{t('landing.designedForTeams')}</div>
        </div>
      </footer>
    </div>
  );
}
