import { useEffect, useState } from 'react';
import { getSignedMediaUrl } from '@/services/api';
import { useTranslation } from '@/context/I18nContext';

type SecureVideoEmbedProps = {
  assetUrl: string;
  title: string;
  className?: string;
};

export function SecureVideoEmbed({ assetUrl, title, className = '' }: SecureVideoEmbedProps) {
  const { t } = useTranslation();
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSignedUrl(null);
    setFailed(false);
    void getSignedMediaUrl(assetUrl).then((url) => {
      if (!cancelled) setSignedUrl(url);
    }).catch(() => {
      if (!cancelled) setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [assetUrl]);

  if (failed) {
    return <div className={`flex min-h-[280px] items-center justify-center text-sm text-red-300 ${className}`}>{t('mediaAccess.videoUnavailable')}</div>;
  }

  if (!signedUrl) {
    return <div className={`flex min-h-[280px] items-center justify-center text-sm text-white/70 ${className}`}>{t('mediaAccess.loadingVideo')}</div>;
  }

  return (
    <iframe
      src={signedUrl}
      title={title}
      className={`block aspect-video w-full max-w-full ${className}`}
      allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
      allowFullScreen
      referrerPolicy="strict-origin-when-cross-origin"
    />
  );
}