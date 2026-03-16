import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { siteConfig } from './siteConfig';
import type { User, Session } from '@supabase/supabase-js';

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signInWithMagicLink: (email: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  session: null,
  loading: true,
  signInWithMagicLink: async () => ({ error: null }),
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

let lastLinkedAccessToken = '';
let pendingLinkAccessToken = '';
let pendingLinkRequest: Promise<void> | null = null;

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);

      if (session?.access_token) {
        void linkBooksByEmail(session.access_token);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);

        // When user logs in, link their books by email
        if (session?.access_token) {
          void linkBooksByEmail(session.access_token);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signInWithMagicLink = async (email: string): Promise<{ error: string | null }> => {
    if (!supabase) return { error: 'Supabase not configured' };

    const runtimeOrigin = typeof window !== 'undefined' ? window.location.origin.trim() : '';
    const redirectBase = runtimeOrigin || siteConfig.siteUrl;
    const redirectTo = `${redirectBase.replace(/\/+$/, '')}/my-books`;

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectTo,
        shouldCreateUser: true,
      },
    });

    if (error) {
      console.error('Magic link error:', error);
      return { error: error.message };
    }

    return { error: null };
  };

  const signOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signInWithMagicLink, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

// Link existing books that were created with this email to the authenticated user
async function linkBooksByEmail(accessToken: string) {
  if (!supabase) return;
  const normalizedAccessToken = typeof accessToken === 'string' ? accessToken.trim() : '';
  if (!normalizedAccessToken) return;
  if (normalizedAccessToken === lastLinkedAccessToken) return;
  if (pendingLinkRequest && pendingLinkAccessToken === normalizedAccessToken) {
    await pendingLinkRequest;
    return;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${normalizedAccessToken}`,
  };

  pendingLinkAccessToken = normalizedAccessToken;
  pendingLinkRequest = (async () => {
    try {
      const response = await fetch('/api/book', {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'link_by_email' }),
      });

      if (response.ok) {
        lastLinkedAccessToken = normalizedAccessToken;
      }
    } catch {
      return;
    }
  })();

  try {
    await pendingLinkRequest;
  } finally {
    if (pendingLinkAccessToken === normalizedAccessToken) {
      pendingLinkAccessToken = '';
    }
    pendingLinkRequest = null;
  }
}
