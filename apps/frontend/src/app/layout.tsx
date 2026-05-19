import type { Metadata } from 'next';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
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
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="dark bg-black" style={{ colorScheme: 'dark' }} suppressHydrationWarning>
        <AuthProvider>
          <CartProvider>
            <Header />
            {/* flex-1 ensures the content area takes up all available space, pushing footer down */}
            <main className="flex-1 flex flex-col w-full bg-black">
              {children}
            </main>
            <CartSheet />
            <Footer />
          </CartProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
