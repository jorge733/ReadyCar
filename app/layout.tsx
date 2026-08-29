import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'ReadyCar — Documentos de tu vehículo al día',
  description: 'Guarda la documentación de tu vehículo y recibe alertas antes de cada vencimiento.',
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
  return <html lang="es"><body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body></html>;
}
