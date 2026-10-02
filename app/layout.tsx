import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://appreadycar.vercel.app'),
  title: 'ReadyCar — Documentos de tu vehículo al día',
  description:
    'Guarda la documentación de tu vehículo y recibe alertas antes de cada vencimiento.',
  applicationName: 'ReadyCar',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
    apple: '/favicon.svg',
  },
  appleWebApp: { capable: true, title: 'ReadyCar', statusBarStyle: 'default' },
  formatDetection: { telephone: false },
  openGraph: {
    title: 'ReadyCar',
    description: 'Tu vehículo, siempre al día.',
    images: ['/og.png'],
    locale: 'es_CL',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ReadyCar',
    description: 'Tu vehículo, siempre al día.',
    images: ['/og.png'],
  },
};

export const viewport: Viewport = {
  themeColor: '#183f33',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-CL">
      <body>{children}</body>
    </html>
  );
}
