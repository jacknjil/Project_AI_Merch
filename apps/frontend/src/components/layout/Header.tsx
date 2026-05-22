'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '../ui/Button';
import { useCart } from '@/context/CartContext';

export function Header() {
  const router = useRouter();
  const { cartCount, setIsOpen } = useCart();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-secondary/90 backdrop-blur-md">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link href="/" className="flex items-center space-x-2">
          <span className="text-xl font-bold font-heading tracking-widest text-accent">
            AI MERCH
          </span>
        </Link>
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
          <Link href="/shop" className="text-muted transition-colors hover:text-primary">
            Shop
          </Link>
          <Link href="/studio/generate" className="text-muted transition-colors hover:text-primary">
            Studio
          </Link>
          <Link href="/gallery" className="text-muted transition-colors hover:text-primary">
            Gallery
          </Link>
        </nav>
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={() => router.push('/login')}>
            Sign In
          </Button>
          <Button variant="primary" size="sm" onClick={() => setIsOpen(true)}>
            Cart ({cartCount})
          </Button>
        </div>
      </div>
    </header>
  );
}
