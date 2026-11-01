'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './auth-provider';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { loading, user, configurationError } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user && !configurationError) router.replace('/entrar');
  }, [configurationError, loading, router, user]);

  if (loading || (!user && !configurationError)) return <main className="auth-loading" aria-live="polite">Verificando sua sessão…</main>;
  if (configurationError) return <main className="auth-loading auth-configuration-error" role="alert">{configurationError}</main>;
  return <>{children}</>;
}
