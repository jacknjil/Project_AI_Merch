'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '../ui/Button';
import { useCartCount, setCartSheetOpen } from '@/lib/cart';

const NAV_LINKS = [
  { href: '/shop', label: 'Shop' },
  { href: '/studio/generate', label: 'Studio' },
  { href: '/gallery', label: 'Gallery' },
];

export function Header() {
  const router = useRouter();
  const cartCount = useCartCount();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-secondary/90 backdrop-blur-md">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link href="/" className="flex items-center space-x-2">
          <span className="text-xl font-bold font-heading tracking-widest text-accent">
            AI MERCH
          </span>
        </Link>
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-muted transition-colors hover:text-primary"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            className="hidden md:inline-flex"
            onClick={() => router.push('/login')}
          >
            Sign In
          </Button>
          <Button variant="primary" size="sm" onClick={() => setCartSheetOpen(true)}>
            Cart ({cartCount})
          </Button>
          <button
            type="button"
            aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={isMobileMenuOpen}
            className="flex h-10 w-10 items-center justify-center rounded-md text-muted transition-colors hover:text-primary md:hidden"
            onClick={() => setIsMobileMenuOpen((open) => !open)}
          >
            {isMobileMenuOpen ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>
      {isMobileMenuOpen && (
        <nav className="border-t border-white/10 bg-secondary/95 px-4 py-3 md:hidden">
          <div className="flex flex-col gap-1 text-sm font-medium">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-md px-3 py-2 text-muted transition-colors hover:bg-white/5 hover:text-primary"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <button
              type="button"
              className="rounded-md px-3 py-2 text-left text-muted transition-colors hover:bg-white/5 hover:text-primary"
              onClick={() => {
                setIsMobileMenuOpen(false);
                router.push('/login');
              }}
            >
              Sign In
            </button>
          </div>
        </nav>
      )}
    </header>
  );
}
