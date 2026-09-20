import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'FinAlly — AI Trading Workstation',
  description: 'A Bloomberg-style AI trading terminal with a built-in copilot.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-base-bg font-sans antialiased">{children}</body>
    </html>
  );
}
