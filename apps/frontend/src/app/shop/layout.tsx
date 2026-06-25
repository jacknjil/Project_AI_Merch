import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Shop — AI Merch',
  description: 'Browse AI-generated designs on shirts, hoodies, mugs, and more.',
  openGraph: {
    title: 'Shop — AI Merch',
    description: 'Browse AI-generated designs on shirts, hoodies, mugs, and more.',
    type: 'website',
  },
};

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
