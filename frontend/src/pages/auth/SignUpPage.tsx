import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  Mail,
  Lock,
  User,
  Eye,
  EyeOff,
  ArrowRight,
  AlertCircle,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import type { MfaChallenge } from '@/context/AuthContext';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { MfaChallengeForm } from '@/components/auth/MfaChallengeForm';
import { isValidEmail, sanitizeEmail, validateDisplayName, validatePassword } from '@/lib/validation';
import { useTranslation } from '@/context/I18nContext';
import { localizedRuntimeError } from '@/lib/errorMessages';

export function SignUpPage() {
  const { signUp, resendVerificationEmail, user, loading: authLoading } = useAuth();
  const { t } = useTranslation();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [verificationRequired, setVerificationRequired] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState('');
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [mfaChallenge, setMfaChallenge] = useState<MfaChallenge | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const sanitizedName = validateDisplayName(fullName);
    const sanitizedEmail = sanitizeEmail(email);
    const passwordError = validatePassword(password);

    if (!sanitizedName) {
      setError(t('auth.validName'));
      return;
    }

    if (!isValidEmail(sanitizedEmail)) {
      setError(t('auth.validEmail'));
      return;
    }

    if (passwordError) {
      setError(localizedRuntimeError(new Error(passwordError), passwordError));
      return;
    }

    setLoading(true);

    const { error: signUpError, mfaChallenge: nextChallenge, verificationRequired: nextVerificationRequired } = await signUp(
      sanitizedEmail,
      password.trim(),
      sanitizedName,
    );

    if (nextChallenge) {
      setMfaChallenge(nextChallenge);
      setLoading(false);
      return;
    }

    if (signUpError) {
      setError(localizedRuntimeError(new Error(signUpError), signUpError));
      setLoading(false);
      return;
    }

    if (nextVerificationRequired) {
      setVerificationRequired(true);
      setVerificationEmail(sanitizedEmail);
    }
    setSuccess(true);
    setLoading(false);
  }

  async function handleResendVerification() {
    setResending(true);
    setResendMessage(null);
    const result = await resendVerificationEmail(verificationEmail);
    setResendMessage(result.error ?? t('emailVerification.resendAccepted'));
    setResending(false);
  }

  if (!authLoading && user) return <Navigate to="/dashboard" replace />;

  if (mfaChallenge) {
    return (
      <AuthLayout title={t('auth.mfaTitle')} subtitle={t('auth.mfaSubtitle')}>
        <MfaChallengeForm challenge={mfaChallenge} />
        <p className="mt-5 text-center text-sm text-gray-500 dark:text-gray-400">
          <Link to="/auth/sign-in" className="font-semibold text-primary-600">{t('auth.signIn')}</Link>
        </p>
      </AuthLayout>
    );
  }

  if (success) {
    return (
      <AuthLayout
        title={verificationRequired ? t('emailVerification.title') : t('auth.accountCreated')}
        subtitle={verificationRequired ? t('emailVerification.subtitle') : t('auth.accountCreatedSubtitle')}
      >
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-success-100 dark:bg-success-900/30">
            <ShieldCheck className="h-7 w-7 text-success-600 dark:text-success-400" />
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {verificationRequired ? t('emailVerification.checkInbox', { email: verificationEmail }) : t('auth.accountCreatedMessage')}
          </p>
          {verificationRequired && (
            <div className="mt-4">
              <button type="button" onClick={() => void handleResendVerification()} disabled={resending} className="text-sm font-semibold text-primary-600 disabled:opacity-50">
                {resending ? t('emailVerification.resending') : t('emailVerification.resend')}
              </button>
              {resendMessage && <p role="status" className="mt-2 text-xs text-gray-500">{resendMessage}</p>}
            </div>
          )}
          <Link to="/auth/sign-in" className="btn-primary mt-6 w-full">
            {t('auth.continueSignIn')}
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={t('auth.createAccount')}
      subtitle={t('auth.signUpSubtitle')}
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="flex items-start gap-2.5 rounded-lg bg-error-50 px-4 py-3 text-sm text-error-700 dark:bg-error-950/40 dark:text-error-300">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div>
          <label htmlFor="fullName" className="label-text">
            {t('auth.fullName')}
          </label>
          <div className="relative">
            <User className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              id="fullName"
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder={t('auth.namePlaceholder')}
              className="input-field ps-10"
              autoComplete="name"
              autoFocus
            />
          </div>
        </div>

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
              placeholder={t('auth.passwordMinPlaceholder')}
              className="input-field ps-10 pe-10"
              autoComplete="new-password"
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

        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              {t('auth.creatingAccount')}
            </span>
          ) : (
            <span className="flex items-center gap-2">
              {t('auth.createAccountButton')}
              <ArrowRight className="directional-icon h-4 w-4" />
            </span>
          )}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
        {t('auth.alreadyAccount')}{' '}
        <Link
          to="/auth/sign-in"
          className="font-semibold text-primary-600 transition-colors hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
        >
          {t('auth.signIn')}
        </Link>
      </p>
    </AuthLayout>
  );
}
