import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Mail } from 'lucide-react';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { useTranslation } from '@/context/I18nContext';
import { isValidEmail, sanitizeEmail } from '@/lib/validation';
import { localizedRuntimeError } from '@/lib/errorMessages';
import { requestPasswordReset } from '@/services/api';

export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const normalizedEmail = sanitizeEmail(email);
    if (!isValidEmail(normalizedEmail)) {
      setError(t('auth.validEmail'));
      return;
    }

    setLoading(true);
    try {
      await requestPasswordReset(normalizedEmail);
      setSubmitted(true);
    } catch (requestError) {
      setError(localizedRuntimeError(requestError, t('passwordReset.requestFailure')));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title={t('passwordReset.forgotTitle')} subtitle={t('passwordReset.forgotSubtitle')}>
      {submitted ? (
        <div className="min-w-0 space-y-5 [overflow-wrap:anywhere]">
          <p role="status" className="rounded-lg bg-success-50 px-4 py-3 text-sm text-success-700 dark:bg-success-950/30 dark:text-success-300">
            {t('passwordReset.requestAccepted')}
          </p>
          <Link to="/auth/sign-in" className="btn-primary w-full">
            <ArrowLeft className="directional-icon h-4 w-4" />
            {t('passwordReset.backToSignIn')}
          </Link>
        </div>
      ) : (
        <form onSubmit={(event) => void handleSubmit(event)} className="min-w-0 space-y-5 [overflow-wrap:anywhere]">
          {error && <p role="alert" className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-700 dark:bg-error-950/40 dark:text-error-300">{error}</p>}
          <div>
            <label htmlFor="forgot-email" className="label-text">{t('auth.email')}</label>
            <div className="relative min-w-0">
              <Mail className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                id="forgot-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={t('auth.emailPlaceholder')}
                className="input-field min-w-0 ps-10"
              />
            </div>
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? t('passwordReset.sending') : t('passwordReset.sendLink')}
          </button>
          <Link to="/auth/sign-in" className="flex items-center justify-center gap-2 text-sm font-medium text-primary-600 hover:underline dark:text-primary-400">
            <ArrowLeft className="directional-icon h-4 w-4" />
            {t('passwordReset.backToSignIn')}
          </Link>
        </form>
      )}
    </AuthLayout>
  );
}