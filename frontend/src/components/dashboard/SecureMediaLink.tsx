import type { ReactNode } from 'react';
import { getSignedMediaUrl } from '@/services/api';

type SecureMediaLinkProps = {
  assetUrl: string;
  className?: string;
  children: ReactNode;
};

export function SecureMediaLink({ assetUrl, className = '', children }: SecureMediaLinkProps) {
  const openAsset = async () => {
    const target = window.open('about:blank', '_blank');
    if (!target) return;
    target.opener = null;
    try {
      target.location.href = await getSignedMediaUrl(assetUrl);
    } catch {
      target.close();
    }
  };

  return (
    <button type="button" onClick={() => void openAsset()} className={className}>
      {children}
    </button>
  );
}