'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { api } from '../lib/api';
import { getSupabaseBrowserClient } from '../lib/supabase';

type AuthContextValue = {
  loading: boolean;
  user: User | null;
  session: Session | null;
  configurationError: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [configurationError, setConfigurationError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    try {
      const supabase = getSupabaseBrowserClient();
      void supabase.auth.getSession().then(({ data, error }) => {
        if (!active) return;
        if (error) setConfigurationError('Não foi possível verificar sua sessão. Tente novamente.');
        setSession(data.session);
        setLoading(false);
      });
      const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
        if (!active) return;
        setSession(nextSession);
        setLoading(false);
      });
      return () => {
        active = false;
        subscription.subscription.unsubscribe();
      };
    } catch (error) {
      if (active) {
        setConfigurationError(error instanceof Error ? error.message : 'A autenticação não está configurada.');
        setLoading(false);
      }
      return () => { active = false; };
    }
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await getSupabaseBrowserClient().auth.signInWithPassword({ email: normalizeEmail(email), password });
    if (error) throw new Error('E-mail ou senha inválidos. Confira os dados ou redefina a senha.');
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    await api.signUp(normalizeEmail(email), password);
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await getSupabaseBrowserClient().auth.signOut({ scope: 'local' });
    if (error) throw new Error('Não foi possível encerrar a sessão. Tente novamente.');
  }, []);

  const requestPasswordReset = useCallback(async (email: string) => {
    const { error } = await getSupabaseBrowserClient().auth.resetPasswordForEmail(normalizeEmail(email), {
      redirectTo: `${window.location.origin}/nova-senha`,
    });
    // Supabase intentionally returns the same successful response for users
    // that do not exist, avoiding account enumeration.
    if (error) throw new Error('Não foi possível solicitar a redefinição agora. Tente novamente mais tarde.');
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    const { error } = await getSupabaseBrowserClient().auth.updateUser({ password });
    if (error) throw new Error('Não foi possível atualizar sua senha. Solicite um novo link e tente novamente.');
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    loading,
    user: session?.user ?? null,
    session,
    configurationError,
    signIn,
    signUp,
    signOut,
    requestPasswordReset,
    updatePassword,
  }), [configurationError, loading, requestPasswordReset, session, signIn, signOut, signUp, updatePassword]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth deve ser usado dentro de AuthProvider.');
  return value;
}

export function accountName(user: User) {
  const metadata = user.user_metadata as Record<string, unknown> | undefined;
  const candidate = metadata?.full_name ?? metadata?.name ?? metadata?.display_name;
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim().slice(0, 80) : (user.email ?? 'Estudante');
}

function normalizeEmail(email: string) { return email.trim().toLowerCase(); }
