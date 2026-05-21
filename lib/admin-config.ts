import { kv } from '@vercel/kv';

const DISABLED_SENTINEL = '__DISABLED__';

/**
 * Read an admin config value. KV first, env var fallback.
 * Returns null if unconfigured or explicitly disabled.
 */
export async function getAdminConfig(key: string): Promise<string | null> {
  try {
    const kvValue = await kv.get<string>(`admin:${key}`);
    if (kvValue === DISABLED_SENTINEL) return null;
    if (kvValue) return kvValue;
  } catch {
    // KV not configured or unavailable — fall through to env var
  }
  return process.env[key.toUpperCase()] || null;
}

/**
 * Write an admin config value to KV.
 * Empty string stores DISABLED sentinel (prevents env var fallback).
 * Throws if KV is unavailable (fail closed for admin writes).
 */
export async function setAdminConfig(key: string, value: string): Promise<void> {
  if (!value) {
    await kv.set(`admin:${key}`, DISABLED_SENTINEL);
  } else {
    await kv.set(`admin:${key}`, value);
  }
}

/**
 * Read all admin config values (masked for display).
 */
export async function getAllAdminConfig(): Promise<Record<string, { configured: boolean; masked: string }>> {
  const keys = ['google_client_id', 'google_client_secret', 'claude_tryit_key'] as const;
  const result: Record<string, { configured: boolean; masked: string }> = {};

  for (const key of keys) {
    const value = await getAdminConfig(key);
    result[key] = {
      configured: !!value,
      masked: value ? maskSecret(key, value) : '',
    };
  }
  return result;
}

function maskSecret(key: string, value: string): string {
  if (key === 'google_client_id') {
    // Client IDs aren't secret, show more
    return value.length > 20 ? `${value.slice(0, 15)}...${value.slice(-10)}` : value;
  }
  // Secrets: show prefix + last 4
  if (value.length <= 8) return '••••••••';
  return `${value.slice(0, 7)}...${value.slice(-4)}`;
}

/**
 * Check if KV store is reachable.
 */
export async function isKvConnected(): Promise<boolean> {
  try {
    await kv.ping();
    return true;
  } catch {
    return false;
  }
}
