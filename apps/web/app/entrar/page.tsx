import { Suspense } from 'react';
import { AuthScreen } from '../../components/auth-screen';

export default function EnterPage() {
  return <Suspense fallback={<main className="auth-loading">Carregando…</main>}><AuthScreen mode="sign-in" /></Suspense>;
}
