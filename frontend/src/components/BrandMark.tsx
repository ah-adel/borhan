import { useEffect, useState } from 'react';
import { GraduationCap } from 'lucide-react';
import { BRAND_LOGO_CHANGE_EVENT, getActivePlatformLogo } from '@/lib/platformBranding';

interface BrandMarkProps {
  className: string;
  iconClassName?: string;
}

export function BrandMark({ className, iconClassName = 'h-6 w-6 text-white' }: BrandMarkProps) {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoUnavailable, setLogoUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let currentObjectUrl: string | null = null;

    const refreshLogo = async () => {
      setLogoUnavailable(false);
      try {
        const logo = await getActivePlatformLogo();
        if (cancelled) return;
        if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
        currentObjectUrl = logo ? URL.createObjectURL(logo) : null;
        setLogoUrl(currentObjectUrl);
      } catch {
        if (!cancelled) {
          setLogoUrl(null);
          setLogoUnavailable(true);
        }
      }
    };

    void refreshLogo();
    window.addEventListener(BRAND_LOGO_CHANGE_EVENT, refreshLogo);
    return () => {
      cancelled = true;
      window.removeEventListener(BRAND_LOGO_CHANGE_EVENT, refreshLogo);
      if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
    };
  }, []);

  const hasLogo = Boolean(logoUrl) && !logoUnavailable;

  return (
    <div
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl ${hasLogo ? 'bg-white p-1 ring-1 ring-black/10' : 'bg-primary-600'} ${className}`}
    >
      {hasLogo ? (
        <img src={logoUrl ?? undefined} alt="" className="h-full w-full object-contain" onError={() => setLogoUnavailable(true)} />
      ) : (
        <GraduationCap className={iconClassName} />
      )}
    </div>
  );
}
