import { useState, type ChangeEvent } from 'react';
import { Image, RotateCcw } from 'lucide-react';
import { BrandMark } from '@/components/BrandMark';
import { removePlatformLogo, uploadPlatformLogo } from '@/lib/platformBranding';
import { useTranslation } from '@/context/I18nContext';

export function BrandLogoSettings() {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await uploadPlatformLogo(file);
      setNotice(t('branding.logoSaved'));
    } catch (uploadError) {
      setError(uploadError instanceof TypeError
        ? t('branding.invalidImage')
        : uploadError instanceof RangeError
          ? t('branding.tooLarge')
          : t('branding.storageError'));
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await removePlatformLogo();
      setNotice(t('branding.logoRemoved'));
    } catch {
      setError(t('branding.storageError'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card space-y-4 p-5" aria-labelledby="branding-logo-title">
      <div className="flex items-center gap-3">
        <BrandMark className="h-11 w-11" iconClassName="h-5 w-5 text-white" />
        <div className="min-w-0">
          <h2 id="branding-logo-title" className="text-lg font-semibold text-content-main">
            {t('branding.logoTitle')}
          </h2>
          <p className="text-sm text-content-muted">{t('branding.logoDescription')}</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
        <label htmlFor="brand-logo-file" className="label-text mb-0">
          <Image className="me-2 inline h-4 w-4" aria-hidden="true" />
          {t('branding.chooseLogo')}
        </label>
        <input
          id="brand-logo-file"
          type="file"
          accept="image/*"
          className="input-field min-w-0 file:me-3 file:rounded-md file:border-0 file:bg-primary-50 file:px-3 file:py-2 file:font-semibold file:text-primary-700"
          disabled={busy}
          onChange={(event) => void handleUpload(event)}
        />
        <button type="button" className="btn-secondary min-h-11" disabled={busy} onClick={() => void handleRemove()}>
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          {t('branding.restoreLogo')}
        </button>
      </div>

      {error && <p className="text-sm text-danger-700 dark:text-danger-300" role="alert">{error}</p>}
      {notice && <p className="text-sm text-success-700 dark:text-success-300" role="status">{notice}</p>}
    </section>
  );
}
