import { useEffect, useState, type ChangeEvent } from 'react';
import { Image, RotateCcw, Trash2 } from 'lucide-react';
import { BrandMark } from '@/components/BrandMark';
import { Button } from '@/components/ui/Button';
import {
  activatePlatformLogo,
  BRAND_LOGO_CHANGE_EVENT,
  deletePlatformLogo,
  getPlatformLogoBlob,
  listPlatformLogos,
  removePlatformLogo,
  uploadPlatformLogo,
  type PlatformLogoVersion,
} from '@/lib/platformBranding';
import { useTranslation } from '@/context/I18nContext';

function LogoVersionPreview({ logoId }: { logoId: number }) {
  const [source, setSource] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    let objectUrl: string | null = null;
    void getPlatformLogoBlob(logoId)
      .then((blob) => {
        if (!mounted || !blob) return;
        objectUrl = URL.createObjectURL(blob);
        setSource(objectUrl);
      })
      .catch(() => setSource(null));

    return () => {
      mounted = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [logoId]);

  return source ? (
    <img src={source} alt="" className="h-12 w-12 shrink-0 rounded-lg border border-border bg-white object-contain p-1" />
  ) : (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-app text-content-muted">
      <Image className="h-5 w-5" aria-hidden="true" />
    </span>
  );
}

export function BrandLogoSettings() {
  const { t, language } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [versions, setVersions] = useState<PlatformLogoVersion[]>([]);

  useEffect(() => {
    let mounted = true;
    const refreshVersions = () => {
      void listPlatformLogos()
        .then((nextVersions) => {
          if (mounted) setVersions(nextVersions);
        })
        .catch(() => {
          if (mounted) setError(t('branding.storageError'));
        });
    };

    refreshVersions();
    window.addEventListener(BRAND_LOGO_CHANGE_EVENT, refreshVersions);
    return () => {
      mounted = false;
      window.removeEventListener(BRAND_LOGO_CHANGE_EVENT, refreshVersions);
    };
  }, [t]);

  const updateVersions = async () => setVersions(await listPlatformLogos());

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await uploadPlatformLogo(file);
      await updateVersions();
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

  const handleActivate = async (versionId: number) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await activatePlatformLogo(versionId);
      await updateVersions();
      setNotice(t('branding.logoActivated'));
    } catch {
      setError(t('branding.storageError'));
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteVersion = async (versionId: number) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await deletePlatformLogo(versionId);
      await updateVersions();
      setNotice(t('branding.versionDeleted'));
    } catch {
      setError(t('branding.storageError'));
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveAll = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await removePlatformLogo();
      await updateVersions();
      setNotice(t('branding.logoRemoved'));
    } catch {
      setError(t('branding.storageError'));
    } finally {
      setBusy(false);
    }
  };

  const formatSavedDate = (timestamp: number) => new Intl.DateTimeFormat(
    language === 'ar' ? 'ar-EG' : 'en-US',
    { dateStyle: 'medium', timeStyle: 'short' },
  ).format(timestamp);

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
        <Button type="button" variant="secondary" disabled={busy || versions.length === 0} onClick={() => void handleRemoveAll()}>
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          {t('branding.restoreLogo')}
        </Button>
      </div>

      <div className="space-y-3" aria-live="polite">
        <h3 className="text-sm font-semibold text-content-main">{t('branding.savedVersions')}</h3>
        {versions.length === 0 ? (
          <p className="text-sm text-content-muted">{t('branding.noSavedVersions')}</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {versions.map((version) => (
              <li key={version.id} className="flex min-w-0 flex-wrap items-center gap-3 p-3">
                <LogoVersionPreview logoId={version.id} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-content-main" title={version.name}>{version.name}</p>
                  <p className="text-xs text-content-muted">{formatSavedDate(version.createdAt)}</p>
                  {version.isActive && <p className="mt-1 text-xs font-semibold text-primary-700 dark:text-primary-300">{t('branding.activeVersion')}</p>}
                </div>
                <div className="ms-auto flex flex-wrap items-center gap-2">
                  {!version.isActive && (
                    <Button type="button" variant="secondary" disabled={busy} onClick={() => void handleActivate(version.id)}>
                      {t('branding.useVersion')}
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="danger"
                    iconOnly
                    aria-label={`${t('branding.deleteVersion')}: ${version.name}`}
                    title={t('branding.deleteVersion')}
                    disabled={busy}
                    onClick={() => void handleDeleteVersion(version.id)}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && <p className="text-sm text-danger-700 dark:text-danger-300" role="alert">{error}</p>}
      {notice && <p className="text-sm text-success-700 dark:text-success-300" role="status">{notice}</p>}
    </section>
  );
}
