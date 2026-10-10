import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, ArrowRight, AlertCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import type { MfaChallenge } from '@/context/AuthContext';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { MfaChallengeForm } from '@/components/auth/MfaChallengeForm';
import { isValidEmail, sanitizeEmail, validatePassword } from '@/lib/validation';
import { useTranslation } from '@/context/I18nContext';
import { localizedRuntimeError } from '@/lib/errorMessages';

export function SignInPage() {
  const { signIn, resendVerificationEmail, user, loading: authLoading } = useAuth();
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mfaChallenge, setMfaChallenge] = useState<MfaChallenge | null>(null);
  const [verificationRequired, setVerificationRequired] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  if (!authLoading && user) return <Navigate to="/dashboard" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setVerificationRequired(false);
    setResendMessage(null);

    const sanitizedEmail = sanitizeEmail(email);
    const passwordError = validatePassword(password);

    if (!isValidEmail(sanitizedEmail)) {
      setError(t('auth.validEmail'));
      return;
    }

    if (passwordError) {
      setError(localizedRuntimeError(new Error(passwordError), passwordError));
      return;
    }

    setLoading(true);

    const { error: signInError, mfaChallenge: nextChallenge, verificationRequired: needsVerification } = await signIn(sanitizedEmail, password.trim(), rememberMe);
    if (nextChallenge) {
      setMfaChallenge(nextChallenge);
      setLoading(false);
      return;
    }
    if (signInError) {
      setVerificationRequired(Boolean(needsVerification));
      setError(localizedRuntimeError(new Error(signInError), signInError));
      setLoading(false);
    }
  }

  async function handleResendVerification() {
    setResending(true);
    setResendMessage(null);
    const result = await resendVerificationEmail(sanitizeEmail(email));
    setResendMessage(result.error ?? t('emailVerification.resendAccepted'));
    setResending(false);
  }

  return (
    <AuthLayout
      title={t('auth.welcomeBack')}
      subtitle={t('auth.signInSubtitle')}
    >
      {mfaChallenge ? (
        <MfaChallengeForm challenge={mfaChallenge} rememberMe={mfaChallenge.rememberMe} onCancel={() => setMfaChallenge(null)} />
      ) : (
      <>
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="flex items-start gap-2.5 rounded-lg bg-error-50 px-4 py-3 text-sm text-error-700 dark:bg-error-950/40 dark:text-error-300">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {verificationRequired && (
          <div className="-mt-2 text-center">
            <button type="button" onClick={() => void handleResendVerification()} disabled={resending} className="text-sm font-semibold text-primary-600 disabled:opacity-50">
              {resending ? t('emailVerification.resending') : t('emailVerification.resend')}
            </button>
            {resendMessage && <p role="status" className="mt-2 text-xs text-gray-500">{resendMessage}</p>}
          </div>
        )}

        <div>
          <label htmlFor="email" className="label-text">
            {t('auth.email')}
          </label>
          <div className="relative">
            <Mail className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('auth.emailPlaceholder')}
              className="input-field ps-10"
              autoComplete="email"
              autoFocus
            />
          </div>
        </div>

        <div>
          <label htmlFor="password" className="label-text">
            {t('auth.password')}
          </label>
          <div className="relative">
            <Lock className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('auth.passwordPlaceholder')}
              className="input-field ps-10 pe-10"
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="absolute end-3 top-1/2 -translate-y-1/2 text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-gray-300"
              aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        <div className="-mt-3 text-end">
          <Link to="/forgot-password" className="text-sm font-semibold text-primary-600 hover:text-primary-700 dark:text-primary-400">
            {t('auth.forgotPassword')}
          </Link>
        </div>

        <label htmlFor="remember-me" className="flex w-fit cursor-pointer items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
          <input
            id="remember-me"
            type="checkbox"
            checked={rememberMe}
            onChange={(event) => setRememberMe(event.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          {t('rememberMe.label')}
        </label>

        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              {t('auth.signingIn')}
            </span>
          ) : (
            <span className="flex items-center gap-2">
              {t('auth.signIn')}
              <ArrowRight className="directional-icon h-4 w-4" />
            </span>
          )}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
        {t('auth.noAccount')}{' '}
        <Link
          to="/auth/sign-up"
          className="font-semibold text-primary-600 transition-colors hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
        >
          {t('auth.createAccount')}
        </Link>
      </p>
      </>
      )}
    </AuthLayout>
  );
}
