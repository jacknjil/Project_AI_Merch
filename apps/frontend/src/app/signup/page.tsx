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

export default function SignupPage() {
  const router = useRouter();
  const { signUp, actionLoading, error } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (password !== confirmPassword) {
      setValidationError("Passwords do not match");
      return;
    }

    if (password.length < 6) {
      setValidationError("Password must be at least 6 characters");
      return;
    }

    try {
      await signUp(email, password);
      router.push('/'); // Redirect, eventually maybe to an onboarding step
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
            <CardTitle className="text-2xl font-bold font-heading text-center">Create Account</CardTitle>
            <CardDescription className="text-center">
              Join AI Merch to start designing
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {(error || validationError) && (
                <div className="p-3 text-sm text-red-500 bg-red-50 border border-red-100 rounded-md">
                  {error || validationError}
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
                placeholder="Create a password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <Input
                label="Confirm Password"
                type="password"
                placeholder="Confirm your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </CardContent>
            <CardFooter className="flex flex-col space-y-4">
              <Button 
                type="submit" 
                className="w-full" 
                variant="accent"
                disabled={actionLoading}
              >
                {actionLoading ? 'Creating Account...' : 'Sign Up'}
              </Button>
              <p className="text-sm text-center text-gray-500">
                Already have an account?{' '}
                <Link href="/login" className="font-semibold text-primary hover:underline">
                  Sign in
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
