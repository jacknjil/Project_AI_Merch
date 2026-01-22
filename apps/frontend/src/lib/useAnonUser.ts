"use client";

import { useEffect, useState } from "react";
import { auth } from "./firebase";
import {
  onAuthStateChanged,
  signInAnonymously,
  User,
} from "firebase/auth";

export function useAnonUser() {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) {
        setUser(u);
        setInitializing(false);
      } else {
        signInAnonymously(auth)
          .then((cred) => {
            setUser(cred.user);
          })
          .catch((err) => {
            console.error("Anonymous sign-in failed:", err);
            setUser(null);
          })
          .finally(() => setInitializing(false));
      }
    });

    return () => unsub();
  }, []);

  return { user, initializing };
}
