import type { MetadataRoute } from 'next';
import { APP_DESCRIPTION } from '@/content/topicCourses';

// The manifest never changes after the build; a static export needs to be told so.
export const dynamic = 'force-static';

// A manifest cannot read CSS variables, so these repeat --color-canvas and --color-primary from globals.css.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Accountancy Master',
    short_name: 'Accountancy',
    description: APP_DESCRIPTION,
    start_url: '/',
    display: 'standalone',
    background_color: '#f3f7f4',
    theme_color: '#047857',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
