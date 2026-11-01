import { Suspense } from 'react';
import { AuthScreen } from '../../components/auth-screen';

export default function SignUpPage() {
  return <Suspense fallback={<main className="auth-loading">Carregando…</main>}><AuthScreen mode="sign-up" /></Suspense>;
}
