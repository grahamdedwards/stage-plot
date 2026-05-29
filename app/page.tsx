'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Validate that a stored path is a safe internal /{owner}/{show} path
// Legacy redirect map — same as middleware.ts (frozen at migration time)
const LEGACY_REDIRECTS: Record<string, string> = {
  'woof-camp-afterglow-sleazzy-top': '/graham/woof-camp-afterglow-sleazzy-top',
  'nicholson-ranch':                 '/graham/nicholson-ranch',
  'fernandos-party':                 '/fernando/fernandos-party',
};

function isValidShowPath(path: string): boolean {
  return /^\/[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/.test(path);
}

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    // Handle legacy ?show=slug URLs — resolve via redirect map
    const params = new URLSearchParams(window.location.search);
    const legacySlug = params.get('show');
    if (legacySlug) {
      const redirect = LEGACY_REDIRECTS[legacySlug];
      router.replace(redirect || '/dashboard');
      return;
    }

    // Handle legacy ?config= URLs
    const legacyConfig = params.get('config');
    if (legacyConfig) {
      localStorage.setItem('showrunr-pending-import', legacyConfig);
      router.replace('/dashboard');
      return;
    }

    // Offline: redirect to last-viewed show if available
    if (!navigator.onLine) {
      const lastShow = localStorage.getItem('showrunr-last-show');
      if (lastShow && isValidShowPath(lastShow)) {
        router.replace(lastShow);
        return;
      }
    }

    // Check auth state — redirect to dashboard or sign-in
    import('@/lib/supabase-browser').then(({ getSupabaseBrowser }) => {
      try {
        const supabase = getSupabaseBrowser();
        supabase.auth.getUser().then(({ data }: { data: { user: unknown } }) => {
          router.replace(data.user ? '/dashboard' : '/sign-in');
        });
      } catch {
        // Supabase not configured — go to sign-in
        router.replace('/sign-in');
      }
    });
  }, [router]);

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <p className="text-zinc-400">Loading...</p>
    </div>
  );
}
