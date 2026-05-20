import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ShowRunr — Stage Plot, Input List & Charts',
    short_name: 'ShowRunr',
    description:
      'Live, mobile-optimized technical rider. Stage plot, input list, monitor mixes, setlist, and charts — shareable via URL, usable offline at the gig.',
    start_url: '/',
    display: 'standalone',
    background_color: '#121212',
    theme_color: '#121212',
    orientation: 'any',
    categories: ['music', 'entertainment', 'productivity'],
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
