import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';

type JwtHeader = { alg?: unknown; typ?: unknown };
type JwtPayload = { sub?: unknown; aud?: unknown; exp?: unknown; nbf?: unknown; iat?: unknown; role?: unknown; iss?: unknown; email?: unknown; user_metadata?: unknown };

export type AuthenticatedUser = { id: string; email?: string; displayName?: string };

/**
 * Trusts only a verified Supabase access-token subject. Demo identity is an
 * opt-in convenience for development and test, never a production fallback.
 */
@Injectable()
export class AuthIdentityService {
  identity(authorization?: string): AuthenticatedUser {
    if (authorization?.startsWith('Bearer ')) return this.fromBearerToken(authorization.slice('Bearer '.length));
    if (this.demoEnabled()) return { id: 'demo-user', displayName: 'Estudante demonstrativo' };
    throw new UnauthorizedException('Autenticação é obrigatória neste ambiente.');
  }

  /** Kept for service-level callers that only need the subject. */
  userId(authorization?: string) { return this.identity(authorization).id; }

  private demoEnabled() {
    return (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') && process.env.DEMO_AUTH_ENABLED === 'true';
  }

  private fromBearerToken(token: string): AuthenticatedUser {
    const secret = process.env.SUPABASE_JWT_SECRET;
    if (!secret || token.length < 32 || token.length > 8_000) throw invalidToken();
    const parts = token.split('.');
    if (parts.length !== 3 || parts.some((part) => part.length > 5_400)) throw invalidToken();
    const header = parsePart<JwtHeader>(parts[0]);
    const payload = parsePart<JwtPayload>(parts[1]);
    if (!header || header.alg !== 'HS256' || (header.typ !== undefined && header.typ !== 'JWT') || !payload) throw invalidToken();
    const expected = createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest();
    const received = decodeBase64Url(parts[2]);
    if (!received || received.length !== expected.length || !timingSafeEqual(received, expected)) throw invalidToken();

    const now = Math.floor(Date.now() / 1000);
    if (!isTimestamp(payload.exp) || payload.exp <= now || (isTimestamp(payload.nbf) && payload.nbf > now) || (isTimestamp(payload.iat) && payload.iat > now + 60)) {
      throw new UnauthorizedException('Token de acesso expirado ou inválido.');
    }
    const audience = process.env.SUPABASE_JWT_AUDIENCE ?? 'authenticated';
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!audiences.some((value) => value === audience) || payload.role !== 'authenticated') throw new UnauthorizedException('Token sem permissão de usuário.');
    const configuredIssuer = process.env.SUPABASE_JWT_ISSUER?.trim();
    if (configuredIssuer && payload.iss !== configuredIssuer) throw invalidToken();
    if (typeof payload.sub !== 'string' || !payload.sub.trim() || payload.sub.length > 160) throw new UnauthorizedException('Token sem identidade de usuário.');

    const email = typeof payload.email === 'string' && payload.email.length <= 320 ? payload.email.trim().toLowerCase() : undefined;
    const name = displayName(payload.user_metadata);
    return { id: payload.sub, ...(email ? { email } : {}), ...(name ? { displayName: name } : {}) };
  }
}

function displayName(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object') return undefined;
  const record = metadata as Record<string, unknown>;
  const candidate = record.full_name ?? record.name ?? record.display_name;
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim().slice(0, 160) : undefined;
}

function invalidToken() { return new UnauthorizedException('Token de acesso inválido.'); }

function parsePart<T>(part: string) {
  const decoded = decodeBase64Url(part);
  if (!decoded) return null;
  try { return JSON.parse(decoded.toString('utf8')) as T; } catch { return null; }
}

function decodeBase64Url(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try { return Buffer.from(value, 'base64url'); } catch { return null; }
}

function isTimestamp(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
