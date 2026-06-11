'use client';

import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { User } from '@supabase/supabase-js';

interface UserContextType {
  user: User | null;
  role: 'admin' | 'viewer' | 'sales' | 'client' | null;
  loading: boolean;
}

const UserContext = createContext<UserContextType>({ user: null, role: null, loading: true });

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<'admin' | 'viewer' | 'sales' | 'client' | null>(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      // TOKEN_REFRESHED y USER_UPDATED no cambian quién es el usuario — no mostrar loading
      const requiresLoadingSpinner = event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'SIGNED_OUT';

      if (requiresLoadingSpinner && mounted.current) {
        setLoading(true);
      }

      try {
        if (session?.user) {
          if (mounted.current) setUser(session.user);
          // Solo refrescar el rol en eventos relevantes
          if (event !== 'TOKEN_REFRESHED' && event !== 'USER_UPDATED') {
            await fetchRole(session.user.id);
          }
        } else {
          if (mounted.current) {
            setUser(null);
            setRole(null);
          }
        }
      } catch (err) {
        console.error('Error on auth change:', err);
      } finally {
        if (requiresLoadingSpinner && mounted.current) {
          setLoading(false);
        }
      }
    });

    return () => {
      mounted.current = false;
      subscription.unsubscribe();
    };
  }, []);

  async function fetchRole(userId: string) {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('fetchRole timeout')), 8000)
    );

    const queryPromise = supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();

    try {
      const { data, error } = await Promise.race([queryPromise, timeoutPromise]);
      if (error) {
        console.error('❌ fetchRole error:', error.message, error.code);
        return;
      }
      if (data?.role && mounted.current) {
        setRole(data.role as 'admin' | 'viewer' | 'sales' | 'client');
      }
    } catch (err: any) {
      console.error('❌ fetchRole failed:', err.message);
    }
  }

  return (
    <UserContext.Provider value={{ user, role, loading }}>
      {children}
    </UserContext.Provider>
  );
}

export const useUser = () => useContext(UserContext);
