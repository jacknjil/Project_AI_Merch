import type { Metadata } from 'next';
import { Header } from '@/components/layout/Header';
import { AuthProvider } from '@/context/AuthContext';
import { CartProvider } from '@/context/CartContext';
import { CartSheet } from '@/components/cart/CartSheet';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI Merch Engine',
  description: 'AI-powered merch studio.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <CartProvider>
            <Header />
            {children}
            <CartSheet />
          </CartProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
