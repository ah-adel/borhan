import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, Lock } from 'lucide-react';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { useTranslation } from '@/context/I18nContext';
import { validatePassword } from '@/lib/validation';
import { localizedRuntimeError } from '@/lib/errorMessages';
import { completePasswordReset } from '@/services/api';

type ApiErrorWithCode = Error & { code?: string };

export function ResetPasswordPage() {
  const { t } = useTranslation();
  const tokenCaptured = useRef(false);
  const [token, setToken] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (tokenCaptured.current) return;
    tokenCaptured.current = true;
    const url = new URL(window.location.href);
    const resetToken = url.searchParams.get('token') ?? '';
    url.searchParams.delete('token');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    setToken(resetToken);
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      setError(t('passwordReset.passwordLength'));
      return;
    }
    if (newPassword.trim() !== confirmPassword.trim()) {
      setError(t('passwordReset.passwordMismatch'));
      return;
    }
    if (!token) {
      setError(t('passwordReset.invalidLink'));
      return;
    }

    setLoading(true);
    try {
      await completePasswordReset(token, newPassword.trim());
      setCompleted(true);
    } catch (requestError) {
      const code = (requestError as ApiErrorWithCode)?.code;
      if (code === 'password_reset_invalid') {
        setError(t('passwordReset.invalidLink'));
      } else if (code === 'password_reset_rate_limited') {
        setError(t('passwordReset.rateLimited'));
      } else {
        setError(localizedRuntimeError(requestError, t('passwordReset.resetFailure')));
      }
    } finally {
      setLoading(false);
    }
  }

  const passwordFields = (
    <>
      {([
        ['new-password', t('passwordReset.newPassword'), newPassword, setNewPassword],
        ['confirm-password', t('passwordReset.confirmPassword'), confirmPassword, setConfirmPassword],
      ] as const).map(([id, label, value, setValue]) => (
        <div key={id}>
          <label htmlFor={id} className="label-text">{label}</label>
          <div className="relative min-w-0">
            <Lock className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              id={id}
              type={showPasswords ? 'text' : 'password'}
              required
              autoComplete="new-password"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={t('auth.passwordMinPlaceholder')}
              className="input-field min-w-0 ps-10 pe-11"
            />
            {id === 'new-password' && (
              <button
                type="button"
                onClick={() => setShowPasswords((current) => !current)}
                className="absolute end-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                aria-label={showPasswords ? t('auth.hidePassword') : t('auth.showPassword')}
              >
                {showPasswords ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            )}
          </div>
        </div>
      ))}
    </>
  );

  return (
    <AuthLayout title={t('passwordReset.resetTitle')} subtitle={t('passwordReset.resetSubtitle')}>
      <div className="min-w-0 space-y-5 [overflow-wrap:anywhere]">
        {token === null ? (
          <p role="status" className="text-sm text-gray-500 dark:text-gray-400">{t('passwordReset.checkingLink')}</p>
        ) : completed ? (
          <>
            <p role="status" className="rounded-lg bg-success-50 px-4 py-3 text-sm text-success-700 dark:bg-success-950/30 dark:text-success-300">
              {t('passwordReset.resetSuccess')}
            </p>
            <Link to="/auth/sign-in" className="btn-primary w-full">
              <ArrowLeft className="directional-icon h-4 w-4" />
              {t('passwordReset.backToSignIn')}
            </Link>
          </>
        ) : !token ? (
          <>
            <p role="alert" className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-700 dark:bg-error-950/40 dark:text-error-300">
              {t('passwordReset.invalidLink')}
            </p>
            <Link to="/auth/sign-in" className="flex items-center justify-center gap-2 text-sm font-medium text-primary-600 hover:underline dark:text-primary-400">
              <ArrowLeft className="directional-icon h-4 w-4" />
              {t('passwordReset.backToSignIn')}
            </Link>
          </>
        ) : (
          <form onSubmit={(event) => void handleSubmit(event)} className="space-y-5">
            {error && <p role="alert" className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-700 dark:bg-error-950/40 dark:text-error-300">{error}</p>}
            {passwordFields}
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? t('passwordReset.updating') : t('passwordReset.updatePassword')}
            </button>
          </form>
        )}
      </div>
    </AuthLayout>
  );
}