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
    window.addEventListener(BRAND_LOGO_CHANGE_EVENT, refreshLogo);
    return () => window.removeEventListener(BRAND_LOGO_CHANGE_EVENT, refreshLogo);
  }, []);

  return (
    <div
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl ${logoUnavailable ? 'bg-primary-600' : 'bg-white p-1 ring-1 ring-black/10'} ${className}`}
    >
      {!logoUnavailable ? (
        <img src={getPlatformLogoUrl(logoRevision)} alt="" className="h-full w-full object-contain" onError={() => setLogoUnavailable(true)} />
      ) : (
        <GraduationCap className={iconClassName} />
      )}
    </div>
  );
}
