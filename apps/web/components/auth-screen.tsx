'use client';

import { FormEvent, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from './auth-provider';

export type AuthScreenMode = 'sign-in' | 'sign-up' | 'confirm-email' | 'recovery' | 'new-password';

export function AuthScreen({ mode }: { mode: AuthScreenMode }) {
  const router = useRouter();
  const params = useSearchParams();
  const { user, loading, configurationError, signIn, signUp, requestPasswordReset, updatePassword } = useAuth();
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  useEffect(() => {
    if (mode !== 'new-password' && !loading && user) router.replace('/');
  }, [loading, mode, router, user]);

  if (configurationError) return <AuthFrame><p className="auth-notice auth-error" role="alert">{configurationError}</p></AuthFrame>;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if ((mode === 'sign-in' || mode === 'sign-up') && password.length < 10) {
      setError('Use uma senha com pelo menos 10 caracteres.');
      return;
    }
    if (mode === 'new-password' && password.length < 10) {
      setError('Use uma nova senha com pelo menos 10 caracteres.');
      return;
    }
    if (mode === 'new-password' && password !== confirmation) {
      setError('As senhas não coincidem.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'sign-in') {
        await signIn(email, password);
        router.replace('/');
      } else if (mode === 'sign-up') {
        await signUp(email, password);
        router.replace('/');
      } else if (mode === 'recovery') {
        await requestPasswordReset(email);
        setEmail('');
        setConfirmation('Se houver uma conta para este e-mail, você receberá as instruções para redefinir a senha.');
      } else if (mode === 'new-password') {
        await updatePassword(password);
        setConfirmation('Sua senha foi atualizada. Agora você pode entrar.');
        setPassword('');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível concluir esta ação. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }

  if (mode === 'confirm-email') return <AuthFrame title="Confirme seu e-mail" intro="Enviamos um link seguro para ativar sua conta.">
    <p className="auth-notice" role="status">{email ? <>Confira a caixa de entrada de <strong>{email}</strong> e também a pasta de spam.</> : 'Confira sua caixa de entrada e também a pasta de spam.'}</p>
    <p className="auth-support">Após confirmar, volte para entrar. Se o link expirar, crie o cadastro novamente usando o mesmo e-mail.</p>
    <Link className="auth-primary-link" href="/entrar">Ir para entrar</Link>
  </AuthFrame>;

  const isRecovery = mode === 'recovery';
  const isNewPassword = mode === 'new-password';
  const isSignUp = mode === 'sign-up';
  const title = isRecovery ? 'Redefinir senha' : isNewPassword ? 'Escolha uma nova senha' : isSignUp ? 'Criar sua conta' : 'Entrar no Nexo';
  const intro = isRecovery ? 'Informe seu e-mail. Não revelaremos se ele possui uma conta.' : isNewPassword ? 'Use o link recebido por e-mail para definir uma senha forte.' : isSignUp ? 'Crie sua conta para começar seus estudos.' : 'Acesse seu estudo com segurança.';

  return <AuthFrame title={title} intro={intro}>
    {params.get('cadastro') === '1' && mode === 'sign-in' && <p className="auth-notice" role="status">Cadastro concluído. Entre com sua senha para continuar.</p>}
    {error && <p className="auth-notice auth-error" role="alert" tabIndex={-1} ref={errorRef}>{error}</p>}
    {confirmation && <p className="auth-notice" role="status">{confirmation}</p>}
    <form className="auth-form" onSubmit={(event) => void submit(event)} noValidate>
      {!isNewPassword && <label htmlFor="auth-email">E-mail
        <input id="auth-email" name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} value={email} onChange={(event) => setEmail(event.target.value)} required autoFocus />
      </label>}
      {!isRecovery && <PasswordField id="auth-password" label={isNewPassword ? 'Nova senha' : 'Senha'} value={password} onChange={setPassword} visible={showPassword} onVisibility={() => setShowPassword((value) => !value)} autoComplete={isNewPassword || isSignUp ? 'new-password' : 'current-password'} />}
      {isNewPassword && <PasswordField id="auth-password-confirmation" label="Repita a nova senha" value={confirmation} onChange={setConfirmation} visible={showPassword} onVisibility={() => setShowPassword((value) => !value)} autoComplete="new-password" />}
      <button className="auth-submit" type="submit" disabled={busy}>{busy ? 'Aguarde…' : isRecovery ? 'Enviar instruções' : isNewPassword ? 'Atualizar senha' : isSignUp ? 'Criar conta' : 'Entrar'}</button>
    </form>
    {mode === 'sign-in' && <div className="auth-links"><Link href="/recuperar-senha">Esqueci minha senha</Link><Link href="/cadastro">Criar conta</Link></div>}
    {mode === 'sign-up' && <p className="auth-links"><Link href="/entrar">Já tenho conta</Link></p>}
    {mode === 'recovery' && <p className="auth-links"><Link href="/entrar">Voltar para entrar</Link></p>}
    {mode === 'new-password' && <p className="auth-links"><Link href="/entrar">Voltar para entrar</Link></p>}
  </AuthFrame>;
}

function PasswordField({ id, label, value, onChange, visible, onVisibility, autoComplete }: { id: string; label: string; value: string; onChange: (value: string) => void; visible: boolean; onVisibility: () => void; autoComplete: string }) {
  return <label htmlFor={id}>{label}<span className="auth-password-field"><input id={id} name={id} type={visible ? 'text' : 'password'} autoComplete={autoComplete} minLength={10} value={value} onChange={(event) => onChange(event.target.value)} required /><button type="button" onClick={onVisibility} aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'} aria-pressed={visible}>{visible ? 'Ocultar' : 'Mostrar'}</button></span></label>;
}

function AuthFrame({ title = 'Nexo ENEM', intro, children }: { title?: string; intro?: string; children: ReactNode }) {
  return <main className="auth-page"><section className="auth-card"><a className="auth-brand" href="/" aria-label="Nexo ENEM">nexo</a><h1>{title}</h1>{intro && <p className="auth-intro">{intro}</p>}{children}</section></main>;
}
