import { useState } from 'react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut as firebaseSignOut,
  UserCredential
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAuthContext } from '@/context/AuthContext';

export function useAuth() {
  const { user, loading } = useAuthContext();
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const signIn = async (email: string, pass: string) => {
    setError(null);
    setActionLoading(true);
    try {
      const result = await signInWithEmailAndPassword(auth, email, pass);
      return result;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setActionLoading(false);
    }
  };

  const signUp = async (email: string, pass: string) => {
    setError(null);
    setActionLoading(true);
    try {
      const result = await createUserWithEmailAndPassword(auth, email, pass);
      return result;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setActionLoading(false);
    }
  };

  const signOut = async () => {
    setError(null);
    setActionLoading(true);
    try {
      await firebaseSignOut(auth);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  return {
    user,
    loading,
    error,
    actionLoading,
    signIn,
    signUp,
    signOut
  };
}
