'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/Card';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';

export default function LoginPage() {
  const router = useRouter();
  const { signIn, actionLoading, error } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await signIn(email, password);
      router.push('/'); // Redirect to home on success
    } catch (err) {
      // Error handled by hook
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50/50">
      <Header />
      <main className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-2xl font-bold font-heading text-center">Welcome Back</CardTitle>
            <CardDescription className="text-center">
              Sign in to your account to continue shopping
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {error && (
                <div className="p-3 text-sm text-red-500 bg-red-50 border border-red-100 rounded-md">
                  {error}
                </div>
              )}
              <Input
                label="Email"
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <Input
                label="Password"
                type="password"
                placeholder="Your secret password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </CardContent>
            <CardFooter className="flex flex-col space-y-4">
              <Button 
                type="submit" 
                className="w-full" 
                variant="primary"
                disabled={actionLoading}
              >
                {actionLoading ? 'Signing in...' : 'Sign In'}
              </Button>
              <p className="text-sm text-center text-gray-500">
                Don't have an account?{' '}
                <Link href="/signup" className="font-semibold text-primary hover:underline">
                  Sign up
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </main>
      <Footer />
    </div>
  );
}
