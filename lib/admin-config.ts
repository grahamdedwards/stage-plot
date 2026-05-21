import { createClient, type RedisClientType } from 'redis';

const DISABLED_SENTINEL = '__DISABLED__';

let client: RedisClientType | null = null;

async function getRedis(): Promise<RedisClientType | null> {
  const url = process.env.REDIS_URL;
  if (!url) return null;

  if (client && client.isOpen) return client;

  try {
    client = createClient({ url });
    await client.connect();
    return client;
  } catch {
    client = null;
    return null;
  }
}

/**
 * Read an admin config value. Redis first, env var fallback.
 * Returns null if unconfigured or explicitly disabled.
 */
export async function getAdminConfig(key: string): Promise<string | null> {
  try {
    const redis = await getRedis();
    if (redis) {
      const value = await redis.get(`admin:${key}`);
      if (value === DISABLED_SENTINEL) return null;
      if (value) return value;
    }
  } catch {
    // Redis not configured or unavailable — fall through to env var
  }
  return process.env[key.toUpperCase()] || null;
}

/**
 * Write an admin config value to Redis.
 * Empty string stores DISABLED sentinel (prevents env var fallback).
 * Throws if Redis is unavailable (fail closed for admin writes).
 */
export async function setAdminConfig(key: string, value: string): Promise<void> {
  const redis = await getRedis();
  if (!redis) throw new Error('Redis not connected');

  await redis.set(`admin:${key}`, value || DISABLED_SENTINEL);
}

/**
 * Read all admin config values (masked for display).
 */
export async function getAllAdminConfig(): Promise<Record<string, { configured: boolean; masked: string }>> {
  const keys = ['google_client_id', 'google_client_secret', 'claude_tryit_key'] as const;
  const result: Record<string, { configured: boolean; masked: string }> = {};

  for (const key of keys) {
    const val = await getAdminConfig(key);
    result[key] = {
      configured: !!val,
      masked: val ? maskSecret(key, val) : '',
    };
  }
  return result;
}

function maskSecret(key: string, value: string): string {
  if (key === 'google_client_id') {
    return value.length > 20 ? `${value.slice(0, 15)}...${value.slice(-10)}` : value;
  }
  if (value.length <= 8) return '••••••••';
  return `${value.slice(0, 7)}...${value.slice(-4)}`;
}

/**
 * Check if Redis store is reachable.
 */
export async function isKvConnected(): Promise<boolean> {
  try {
    const redis = await getRedis();
    if (!redis) return false;
    await redis.ping();
    return true;
  } catch {
    return false;
  }
}
