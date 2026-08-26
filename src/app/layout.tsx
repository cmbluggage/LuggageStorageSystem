import type { Metadata } from 'next';
import { Toaster } from 'react-hot-toast';
import './globals.css';
import { SITE_URL } from '@/lib/site';
import { SmoothScroll } from '@/components/ui/SmoothScroll';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    template: '%s | Luggage Storage Colombo',
    default: 'Luggage Storage Colombo — Luggage Storage Service Colombo Airport',
  },
  description: 'Store your luggage securely near Colombo Airport. 24/7 drop-off and collection.',
  alternates: { canonical: '/' },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Google+Sans:ital,wght@0,400;0,500;0,700;1,400;1,500;1,700&family=Google+Sans+Text:ital,wght@0,400;0,500;0,700;1,400;1,500;1,700&family=Google+Sans+Display:ital,wght@0,400;0,500;0,700;1,400;1,500;1,700&family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&family=IBM+Plex+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body>
        <SmoothScroll />
        {children}
        <Toaster
          position="bottom-right"
          gutter={10}
          toastOptions={{
            duration: 4000,
            style: {
              background: '#ffffff',
              color: '#1C130E',
              fontWeight: 600,
              fontSize: '13px',
              borderRadius: '16px',
              padding: '12px 18px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 20px 25px -5px rgba(28, 19, 14, 0.12), 0 8px 10px -6px rgba(28, 19, 14, 0.08)',
            },
            success: {
              iconTheme: {
                primary: '#16a34a',
                secondary: '#ffffff',
              },
              style: {
                border: '1px solid #bbf7d0',
                background: '#f0fdf4',
                color: '#14532d',
              },
            },
            error: {
              iconTheme: {
                primary: '#dc2626',
                secondary: '#ffffff',
              },
              style: {
                border: '1px solid #fecaca',
                background: '#fef2f2',
                color: '#7f1d1d',
              },
            },
          }}
        />
      </body>
    </html>
  );
}
