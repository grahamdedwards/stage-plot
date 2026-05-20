import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Show Bible — Stage Plot, Input List & Charts',
    short_name: 'Show Bible',
    description:
      'Live, mobile-optimized technical rider. Stage plot, input list, monitor mixes, setlist, and charts — shareable via URL, usable offline at the gig.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f9fafb',
    theme_color: '#000000',
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
