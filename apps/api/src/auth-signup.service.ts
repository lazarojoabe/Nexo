import { Injectable, ServiceUnavailableException } from '@nestjs/common';

@Injectable()
export class AuthSignupService {
  async signUp(email: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceRoleKey) throw new ServiceUnavailableException('O cadastro não está disponível no momento. Tente novamente mais tarde.');
    try {
      // Direct Supabase signups are disabled in the project. The service role
      // creates accounts, while Supabase still owns password
      // hashing, sessions and recovery. New accounts are explicitly marked as
      // confirmed so this flow neither sends an email nor depends on a redirect URL.
      const create = await fetch(`${url}/auth/v1/admin/users`, {
        method: 'POST',
        headers: { apikey: serviceRoleKey, authorization: `Bearer ${serviceRoleKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail, password, email_confirm: true }),
      });
      // 422 commonly means an existing user. Keep the public response neutral
      // so this endpoint does not reveal whether an account already exists.
      if (!create.ok && create.status !== 400 && create.status !== 422) throw new Error('signup-create-failed');
    } catch {
      throw new ServiceUnavailableException('O cadastro não está disponível no momento. Tente novamente mais tarde.');
    }
    // Do not distinguish an existing account from a newly created one.
    return { readyToSignIn: true as const };
  }
}
