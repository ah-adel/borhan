import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { MailCheck } from 'lucide-react';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { useAuth } from '@/context/AuthContext';
import { useTranslation } from '@/context/I18nContext';

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const { verifyEmail } = useAuth();
  const { t } = useTranslation();
  const [state, setState] = useState<'ready' | 'loading' | 'verified' | 'error'>('ready');

  async function handleVerify() {
    const token = searchParams.get('token') ?? '';
    if (!token) {
      setState('error');
      return;
    }
    setState('loading');
    const result = await verifyEmail(token);
    setState(result.error ? 'error' : 'verified');
  }

  return (
    <AuthLayout
      title={state === 'verified' ? t('emailVerification.verifiedTitle') : t('emailVerification.verifyTitle')}
      subtitle={t('emailVerification.verifySubtitle')}
    >
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-success-100 dark:bg-success-900/30">
          <MailCheck className="h-7 w-7 text-success-600 dark:text-success-400" />
        </div>
        {state === 'error' && <p role="alert" className="mb-4 text-sm text-error-600">{t('emailVerification.invalidLink')}</p>}
        {state === 'verified' ? (
          <Link to="/auth/sign-in" className="btn-primary mt-4 w-full">{t('emailVerification.continueSignIn')}</Link>
        ) : (
          <button type="button" onClick={() => void handleVerify()} disabled={state === 'loading'} className="btn-primary w-full disabled:opacity-50">
            {state === 'loading' ? t('emailVerification.verifying') : t('emailVerification.verifyButton')}
          </button>
        )}
      </div>
    </AuthLayout>
  );
}