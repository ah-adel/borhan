import { useEffect, useState } from 'react';
import { GraduationCap } from 'lucide-react';
import { BRAND_LOGO_CHANGE_EVENT, getPlatformLogoUrl } from '@/lib/platformBranding';

interface BrandMarkProps {
  className: string;
  iconClassName?: string;
}

export function BrandMark({ className, iconClassName = 'h-6 w-6 text-white' }: BrandMarkProps) {
  const [logoRevision, setLogoRevision] = useState(0);
  const [logoUnavailable, setLogoUnavailable] = useState(false);

  useEffect(() => {
    const refreshLogo = () => {
      setLogoUnavailable(false);
      setLogoRevision(Date.now());
    };

    const refreshOnVisibility = () => {
      if (document.visibilityState === 'visible') refreshLogo();
    };
    window.addEventListener(BRAND_LOGO_CHANGE_EVENT, refreshLogo);
    window.addEventListener('focus', refreshLogo);
    document.addEventListener('visibilitychange', refreshOnVisibility);
    return () => {
      window.removeEventListener(BRAND_LOGO_CHANGE_EVENT, refreshLogo);
      window.removeEventListener('focus', refreshLogo);
      document.removeEventListener('visibilitychange', refreshOnVisibility);
    };
  }, []);

  const hasLogo = !logoUnavailable;

  return (
    <div
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl ${hasLogo ? 'bg-white p-1 ring-1 ring-black/10' : 'bg-primary-600'} ${className}`}
    >
      {hasLogo ? (
        <img src={getPlatformLogoUrl(logoRevision)} alt="" className="h-full w-full object-contain" onError={() => setLogoUnavailable(true)} />
      ) : (
        <GraduationCap className={iconClassName} />
      )}
    </div>
  );
}
