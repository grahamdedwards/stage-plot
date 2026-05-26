const LEADING_ARTICLES = /^(the|a|an)\s+/i;

const ALLOWED_ROLES = ['guitar', 'lyrics', 'keys', 'bass', 'horns', 'drums', 'other'] as const;
export type ChartRole = typeof ALLOWED_ROLES[number];

/**
 * Normalize a song title to a stable key for chart library matching.
 * WRITE path — throws on empty result (prevents invalid data entering DB).
 */
export function normalizeSongKey(title: string): string {
  const key = normalizeInternal(title);
  if (!key) {
    throw new Error(`Cannot normalize song title to a valid key: "${title}"`);
  }
  return key;
}

/**
 * Safe variant for READ paths — returns null instead of throwing.
 * Use in slug resolution and show loading where blank titles shouldn't crash.
 */
export function normalizeSongKeySafe(title: string): string | null {
  return normalizeInternal(title) || null;
}

function normalizeInternal(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // strip combining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')     // strip punctuation FIRST
    .replace(/\s+/g, ' ')            // collapse whitespace
    .trim()
    .replace(LEADING_ARTICLES, '');   // strip articles AFTER punctuation is gone
}

/**
 * Canonicalize a role string to the allowlist.
 * Unknown roles map to 'other'.
 */
export function canonicalizeRole(input: string): ChartRole {
  const lower = input.toLowerCase().trim() as ChartRole;
  if (ALLOWED_ROLES.includes(lower)) return lower;
  return 'other';
}

/**
 * Display a canonical role with title casing.
 */
export function displayRole(role: ChartRole): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export { ALLOWED_ROLES };
