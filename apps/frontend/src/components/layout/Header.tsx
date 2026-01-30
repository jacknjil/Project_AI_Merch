import Link from 'next/link';
import { Button } from '../ui/Button';
import { useCart } from '@/context/CartContext';

export function Header() {
  const { cartCount, setIsOpen } = useCart();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-gray-200 bg-white/80 backdrop-blur-md">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link href="/" className="flex items-center space-x-2">
          <span className="text-xl font-bold font-heading tracking-tight">AI MERCH</span>
        </Link>
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
          <Link href="/products" className="transition-colors hover:text-primary">
            Shop
          </Link>
          <Link href="/about" className="transition-colors hover:text-primary">
            About
          </Link>
        </nav>
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm">
            Sign In
          </Button>
          <Button 
            variant="primary" 
            size="sm"
            onClick={() => setIsOpen(true)}
          >
            Cart ({cartCount})
          </Button>
        </div>
      </div>
    </header>
  );
}
