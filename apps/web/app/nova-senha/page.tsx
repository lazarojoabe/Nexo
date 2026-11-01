import { Suspense } from 'react';
import { AuthScreen } from '../../components/auth-screen';

export default function NewPasswordPage() {
  return <Suspense fallback={<main className="auth-loading">Carregando…</main>}><AuthScreen mode="new-password" /></Suspense>;
}
