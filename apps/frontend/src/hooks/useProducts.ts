import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, orderBy, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Product } from '@/lib/types';

export function useProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchProducts();
  }, []);

  async function fetchProducts() {
    try {
      setLoading(true);
      // Fallback: if 'active' index is missing, we might need to remove the where clause or create index
      // For now, let's try a simple fetch everything to avoid index errors during dev
      const productsCol = collection(db, 'products');
      const q = query(productsCol, orderBy('name', 'asc'));
      
      const snapshot = await getDocs(q);
      const items = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data
        } as Product;
      });
      
      setProducts(items);
    } catch (err: any) {
      console.error('Error fetching products:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const getProduct = async (id: string): Promise<Product | null> => {
    try {
      const docRef = doc(db, 'products', id);
      const snapshot = await getDoc(docRef);
      if (snapshot.exists()) {
        return { id: snapshot.id, ...snapshot.data() } as Product;
      }
      return null;
    } catch (err) {
      console.error('Error fetching product:', err);
      return null;
    }
  };

  return { products, loading, error, refresh: fetchProducts, getProduct };
}
