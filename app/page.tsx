'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Validate that a stored path is a safe internal /{owner}/{show} path
function isValidShowPath(path: string): boolean {
  return /^\/[a-z0-9][a-z0-9-]*[a-z0-9]\/[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(path);
}

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    // Handle legacy ?show=slug URLs
    const params = new URLSearchParams(window.location.search);
    const legacySlug = params.get('show');
    if (legacySlug) {
      // Legacy URLs no longer resolve at /{slug} — user needs to find the show via dashboard
      router.replace('/dashboard');
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
