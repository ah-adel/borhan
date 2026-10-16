import { useEffect, useState } from 'react';
import { GraduationCap } from 'lucide-react';
import { BRAND_LOGO_CHANGE_EVENT, getLocalBrandLogo } from '@/lib/localBrandLogo';

interface BrandMarkProps {
  className: string;
  iconClassName?: string;
}

export function BrandMark({ className, iconClassName = 'h-6 w-6 text-white' }: BrandMarkProps) {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let requestVersion = 0;
    let currentUrl: string | null = null;

    const loadLogo = async () => {
      const version = ++requestVersion;
      try {
        const logo = await getLocalBrandLogo();
        const nextUrl = logo ? URL.createObjectURL(logo) : null;
        if (!active || version !== requestVersion) {
          if (nextUrl) URL.revokeObjectURL(nextUrl);
          return;
        }
        if (currentUrl) URL.revokeObjectURL(currentUrl);
        currentUrl = nextUrl;
        setLogoUrl(nextUrl);
      } catch {
        if (active && version === requestVersion) setLogoUrl(null);
      }
    };

    const refreshLogo = () => void loadLogo();
    window.addEventListener(BRAND_LOGO_CHANGE_EVENT, refreshLogo);
    window.addEventListener('storage', refreshLogo);
    refreshLogo();

    return () => {
      active = false;
      window.removeEventListener(BRAND_LOGO_CHANGE_EVENT, refreshLogo);
      window.removeEventListener('storage', refreshLogo);
      if (currentUrl) URL.revokeObjectURL(currentUrl);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl ${logoUrl ? 'bg-white p-1 ring-1 ring-black/10' : 'bg-primary-600'} ${className}`}
    >
      {logoUrl ? (
        <img src={logoUrl} alt="" className="h-full w-full object-contain" onError={() => setLogoUrl(null)} />
      ) : (
        <GraduationCap className={iconClassName} />
      )}
    </div>
  );
}
