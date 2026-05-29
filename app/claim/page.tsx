'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ClaimPage() {
  const [handle, setHandle] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  const slug = handle.toLowerCase().replace(/[^a-z0-9-]/g, '');
  const isValid = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(slug);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;

    setSubmitting(true);
    setError('');

    const res = await fetch('/api/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ owner_slug: slug, display_name: displayName || null }),
    });

    if (res.ok) {
      router.push('/dashboard');
    } else {
      const data = await res.json();
      setError(data.error || 'Something went wrong');
    }
    setSubmitting(false);
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
      <form onSubmit={handleSubmit} className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white">Claim your RunR</h1>
          <p className="text-zinc-400 mt-2">Pick a handle for your ShowRunr URL</p>
        </div>

        <div>
          <label className="block text-sm text-zinc-400 mb-1">Handle</label>
          <div className="flex items-center gap-0 rounded-lg overflow-hidden border border-zinc-700 focus-within:border-blue-500 transition-colors">
            <span className="bg-zinc-800 text-zinc-500 px-3 py-2.5 text-sm select-none whitespace-nowrap">
              showrunr.ai/
            </span>
            <input
              type="text"
              value={handle}
              onChange={(e) => {
                setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
                setError('');
              }}
              placeholder="your-handle"
              className="flex-1 bg-zinc-900 text-white px-3 py-2.5 text-sm outline-none min-w-0"
              maxLength={30}
              autoFocus
            />
          </div>
          {handle && !isValid && (
            <p className="text-xs text-zinc-500 mt-1">3-30 characters, letters, numbers, and hyphens</p>
          )}
        </div>

        <div>
          <label className="block text-sm text-zinc-400 mb-1">Display name (optional)</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name or band name"
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500 transition-colors"
            maxLength={100}
          />
        </div>

        {error && (
          <p className="text-sm text-red-400">{error}</p>
        )}

        <button
          type="submit"
          disabled={!isValid || submitting}
          className="w-full py-2.5 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? 'Claiming...' : 'Claim it'}
        </button>
      </form>
    </div>
  );
}
