import type { Metadata } from 'next';
import { Barlow_Condensed, Manrope, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

const display = Barlow_Condensed({ subsets: ['latin'], weight: ['600', '700', '800'], variable: '--font-display' });
const body = Manrope({ subsets: ['latin'], variable: '--font-body' });
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'Chicken Legs — Put your money where my muscles are.',
  description: 'Eight spots. One untrained marathon. Sponsor a quad, hamstring, calf or front ankle for the Nice–Cannes marathon on 8 November 2026. Bids start at $1,000.',
  robots: { index: process.env.CHECKOUT_ENABLED === 'true', follow: true },
  openGraph: { title: 'I’m selling my chicken legs.', description: 'Your logo. My legs. 42.195 km of questionable decisions.', type: 'website' }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${display.variable} ${body.variable} ${mono.variable}`}>{children}</body></html>;
}
