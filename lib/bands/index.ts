import type { BandConfig } from '../types';
import looselyCovered from './loosely-covered';

// Registry — add new bands here
const bands: Record<string, BandConfig> = {
  'loosely-covered': looselyCovered,
};

export const defaultBand = 'loosely-covered';

export function getBand(slug?: string | null): BandConfig {
  if (slug && bands[slug]) return bands[slug];
  return bands[defaultBand];
}

export function listBands(): BandConfig[] {
  return Object.values(bands);
}
