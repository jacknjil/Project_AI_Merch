'use client';

import React, { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';

const TestPage: React.FC = () => {
  const [count, setCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const snapshot = await getDocs(collection(db, 'assets'));
        setCount(snapshot.size);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        console.error(err);
        setError(err?.message ?? 'Unknown error');
      }
    }

    load();
  }, []);

  return (
    <main style={{ padding: 24 }}>
      <h1>Firestore Test</h1>

      {error && <p style={{ color: 'red' }}>Error: {error}</p>}

      {count !== null && !error && (
        <p>
          Documents in <code>assets</code>: {count}
        </p>
      )}

      {count === null && !error && <p>Loading…</p>}
    </main>
  );
};

export default TestPage;
