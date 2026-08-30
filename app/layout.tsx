import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://appreadycar.vercel.app'),
  title: 'ReadyCar — Documentos de tu vehículo al día',
  description: 'Guarda la documentación de tu vehículo y recibe alertas antes de cada vencimiento.',
  icons: { icon: '/favicon.svg', shortcut: '/favicon.svg' },
  openGraph: {
    title: 'ReadyCar',
    description: 'Tu vehículo, siempre al día.',
    images: ['/og.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ReadyCar',
    description: 'Tu vehículo, siempre al día.',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}
