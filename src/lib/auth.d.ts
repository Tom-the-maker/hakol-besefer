import React from 'react';
import type { User, Session } from '@supabase/supabase-js';
interface AuthState {
    user: User | null;
    session: Session | null;
    loading: boolean;
    signInWithMagicLink: (email: string) => Promise<{
        error: string | null;
    }>;
    signOut: () => Promise<void>;
}
export declare const useAuth: () => AuthState;
export declare const AuthProvider: React.FC<{
    children: React.ReactNode;
}>;
export {};
