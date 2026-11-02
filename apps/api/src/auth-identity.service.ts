import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHmac, createPublicKey, timingSafeEqual, verify as verifySignature, type KeyObject } from 'node:crypto';

type JwtHeader = { alg?: unknown; typ?: unknown; kid?: unknown };
type JwtPayload = { sub?: unknown; aud?: unknown; exp?: unknown; nbf?: unknown; iat?: unknown; role?: unknown; iss?: unknown; email?: unknown; user_metadata?: unknown };
type Jwk = { kid?: unknown; kty?: unknown; alg?: unknown; use?: unknown; crv?: unknown; x?: unknown; y?: unknown };
type SigningKeys = { keys: Map<string, KeyObject>; expiresAt: number };

export type AuthenticatedUser = { id: string; email?: string; displayName?: string };

/**
 * Trusts only a verified Supabase access-token subject. Demo identity is an
 * opt-in convenience for development and test, never a production fallback.
 */
@Injectable()
export class AuthIdentityService {
  private signingKeys?: SigningKeys;

  async identity(authorization?: string): Promise<AuthenticatedUser> {
    if (authorization?.startsWith('Bearer ')) return this.fromBearerToken(authorization.slice('Bearer '.length));
    if (this.demoEnabled()) return { id: 'demo-user', displayName: 'Estudante demonstrativo' };
    throw new UnauthorizedException('Autenticação é obrigatória neste ambiente.');
  }

  /** Kept for service-level callers that only need the subject. */
  async userId(authorization?: string) { return (await this.identity(authorization)).id; }

  private demoEnabled() {
    return (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') && process.env.DEMO_AUTH_ENABLED === 'true';
  }

  private async fromBearerToken(token: string): Promise<AuthenticatedUser> {
    if (token.length < 32 || token.length > 8_000) throw invalidToken();
    const parts = token.split('.');
    if (parts.length !== 3 || parts.some((part) => part.length > 5_400)) throw invalidToken();
    const header = parsePart<JwtHeader>(parts[0]);
    const payload = parsePart<JwtPayload>(parts[1]);
    if (!header || (header.typ !== undefined && header.typ !== 'JWT') || !payload) throw invalidToken();
    const received = decodeBase64Url(parts[2]);
    if (!received) throw invalidToken();

    const signingInput = `${parts[0]}.${parts[1]}`;
    if (header.alg === 'HS256') this.verifyHs256(signingInput, received);
    else if (header.alg === 'ES256') await this.verifyEs256(signingInput, received, header.kid);
    else throw invalidToken();

    return this.authenticatedUser(payload);
  }

  private verifyHs256(signingInput: string, received: Buffer) {
    const secret = process.env.SUPABASE_JWT_SECRET;
    if (!secret) throw invalidToken();
    const expected = createHmac('sha256', secret).update(signingInput).digest();
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw invalidToken();
  }

  private async verifyEs256(signingInput: string, received: Buffer, kid: unknown) {
    if (typeof kid !== 'string' || !kid || kid.length > 256 || received.length !== 64) throw invalidToken();
    const key = (await this.supabaseSigningKeys()).get(kid);
    if (!key || !verifySignature('sha256', Buffer.from(signingInput), { key, dsaEncoding: 'ieee-p1363' }, received)) throw invalidToken();
  }

  private async supabaseSigningKeys(): Promise<Map<string, KeyObject>> {
    if (this.signingKeys && this.signingKeys.expiresAt > Date.now()) return this.signingKeys.keys;

    const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
    if (!url) throw invalidToken();
    try {
      const response = await fetch(`${url}/auth/v1/.well-known/jwks.json`, { signal: AbortSignal.timeout(5_000) });
      if (!response.ok) throw new Error('jwks-response');
      const value: unknown = await response.json();
      if (!value || typeof value !== 'object' || !Array.isArray((value as { keys?: unknown }).keys)) throw new Error('jwks-payload');

      const keys = new Map<string, KeyObject>();
      for (const candidate of (value as { keys: unknown[] }).keys.slice(0, 20)) {
        if (!isEs256Jwk(candidate)) continue;
        try { keys.set(candidate.kid, createPublicKey({ key: candidate, format: 'jwk' })); } catch { /* Ignore malformed public keys. */ }
      }
      if (!keys.size) throw new Error('jwks-keys');
      this.signingKeys = { keys, expiresAt: Date.now() + 5 * 60 * 1000 };
      return keys;
    } catch {
      throw invalidToken();
    }
  }

  private authenticatedUser(payload: JwtPayload): AuthenticatedUser {
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

function isEs256Jwk(value: unknown): value is Jwk & { kid: string; kty: 'EC'; alg: 'ES256'; crv: 'P-256'; x: string; y: string } {
  if (!value || typeof value !== 'object') return false;
  const key = value as Jwk;
  return typeof key.kid === 'string' && key.kid.length > 0 && key.kid.length <= 256
    && key.kty === 'EC' && key.alg === 'ES256' && key.crv === 'P-256'
    && typeof key.x === 'string' && typeof key.y === 'string';
}

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
