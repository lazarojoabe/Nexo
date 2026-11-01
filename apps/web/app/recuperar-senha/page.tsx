import { Suspense } from 'react';
import { AuthScreen } from '../../components/auth-screen';

export default function PasswordRecoveryPage() {
  return <Suspense fallback={<main className="auth-loading">Carregando…</main>}><AuthScreen mode="recovery" /></Suspense>;
}
