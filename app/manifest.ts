import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ReadyCar — Documentos al día',
    short_name: 'ReadyCar',
    description: 'Tus vehículos y documentos en un solo lugar.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f4f3ef',
    theme_color: '#183f33',
    lang: 'es-CL',
    icons: [
      {
        src: '/favicon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
  };
}
