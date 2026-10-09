import { useState, type ReactNode } from 'react';
import { getSignedMediaUrl } from '@/services/api';

type SecureMediaLinkProps = {
  assetUrl: string;
  className?: string;
  children: ReactNode;
  loadingLabel?: string;
  errorLabel?: string;
};

export function SecureMediaLink({
  assetUrl,
  className = '',
  children,
  loadingLabel = 'Opening media...',
  errorLabel = 'Unable to open this media. Please try again.',
}: SecureMediaLinkProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openAsset = async () => {
    setError(null);
    const target = window.open('about:blank', '_blank');
    if (!target) {
      setError(errorLabel);
      return;
    }

    target.opener = null;
    setIsLoading(true);
    try {
      target.location.href = await getSignedMediaUrl(assetUrl);
    } catch {
      target.close();
      setError(errorLabel);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void openAsset()}
        className={className}
        disabled={isLoading}
        aria-busy={isLoading}
      >
        {isLoading ? loadingLabel : children}
      </button>
      {error && <span role="alert" className="ms-2 text-sm text-red-600 dark:text-red-400">{error}</span>}
    </>
  );
}