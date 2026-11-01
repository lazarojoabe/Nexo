import { ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';

@Injectable()
export class AuthSignupService {
  async signUp(email: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const allowed = allowedEmails();
    if (!allowed.size) {
      throw new ForbiddenException(process.env.NODE_ENV === 'production'
        ? 'Novos cadastros estão desativados porque a beta fechada ainda não possui e-mails autorizados.'
        : 'Nenhum e-mail foi autorizado para cadastro. Configure ALLOWED_SIGNUP_EMAILS para habilitar a beta.');
    }
    if (!allowed.has(normalizedEmail)) throw new ForbiddenException('Este e-mail não está autorizado para a beta fechada.');

    const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
    const anonKey = process.env.SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !anonKey || !serviceRoleKey) throw new ServiceUnavailableException('O cadastro não está disponível no momento. Tente novamente mais tarde.');
    const webOrigin = configuredWebOrigin();
    try {
      // Direct Supabase signups are disabled in the project. The service role
      // creates only allowlisted accounts, while Supabase still owns password
      // hashing, confirmation, sessions and recovery.
      const create = await fetch(`${url}/auth/v1/admin/users`, {
        method: 'POST',
        headers: { apikey: serviceRoleKey, authorization: `Bearer ${serviceRoleKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail, password, email_confirm: false }),
      });
      // 422 commonly means an existing user. Continue to the same resend path
      // so the public response cannot reveal whether the account exists.
      if (!create.ok && create.status !== 400 && create.status !== 422) throw new Error('signup-create-failed');
      const resend = await fetch(`${url}/auth/v1/resend`, {
        method: 'POST',
        headers: { apikey: anonKey, authorization: `Bearer ${anonKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'signup', email: normalizedEmail, options: { emailRedirectTo: `${webOrigin}/entrar?confirmado=1` } }),
      });
      if (!resend.ok && resend.status >= 500) throw new Error('signup-resend-failed');
    } catch {
      throw new ServiceUnavailableException('O cadastro não está disponível no momento. Tente novamente mais tarde.');
    }
    // Do not distinguish an existing account from a newly created one.
    return { confirmationRequired: true as const };
  }
}

function allowedEmails() { return new Set((process.env.ALLOWED_SIGNUP_EMAILS ?? '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean)); }

function configuredWebOrigin() {
  const configured = process.env.WEB_ORIGIN?.split(',').map((origin) => origin.trim()).find(Boolean);
  if (configured) return configured.replace(/\/$/, '');
  if (process.env.NODE_ENV !== 'production') return 'http://localhost:3002';
  throw new ServiceUnavailableException('O cadastro não está disponível no momento. Tente novamente mais tarde.');
}
