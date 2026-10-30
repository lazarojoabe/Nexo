import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';

type JwtHeader = { alg?: string };
type JwtPayload = { sub?: unknown; aud?: unknown; exp?: unknown; nbf?: unknown; role?: unknown };

/**
 * Development retains the explicit demo identity. Production only accepts a
 * signed Supabase HS256 access token and never trusts x-user-id.
 */
@Injectable()
export class AuthIdentityService {
  userId(authorization?: string, demoUserId?: string) {
    if (authorization?.startsWith('Bearer ')) return this.fromBearerToken(authorization.slice(7));
    if (process.env.NODE_ENV === 'production') throw new UnauthorizedException('Autenticação é obrigatória neste ambiente.');
    return demoUserId?.trim() || 'demo-user';
  }

  private fromBearerToken(token: string) {
    const secret = process.env.SUPABASE_JWT_SECRET;
    if (!secret || token.length > 8_000) throw new UnauthorizedException('Token de acesso inválido.');
    const parts = token.split('.');
    if (parts.length !== 3) throw new UnauthorizedException('Token de acesso inválido.');
    const header = parsePart<JwtHeader>(parts[0]);
    const payload = parsePart<JwtPayload>(parts[1]);
    if (header?.alg !== 'HS256' || !payload) throw new UnauthorizedException('Token de acesso inválido.');
    const expected = createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest();
    const received = decodeBase64Url(parts[2]);
    if (!received || received.length !== expected.length || !timingSafeEqual(received, expected)) throw new UnauthorizedException('Token de acesso inválido.');
    const now = Math.floor(Date.now() / 1000);
    if (!isTimestamp(payload.exp) || payload.exp <= now || (isTimestamp(payload.nbf) && payload.nbf > now)) throw new UnauthorizedException('Token de acesso expirado ou inválido.');
    const audience = process.env.SUPABASE_JWT_AUDIENCE ?? 'authenticated';
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!audiences.includes(audience) || (typeof payload.role === 'string' && payload.role !== 'authenticated')) throw new UnauthorizedException('Token sem permissão de usuário.');
    if (typeof payload.sub !== 'string' || !payload.sub.trim() || payload.sub.length > 160) throw new UnauthorizedException('Token sem identidade de usuário.');
    return payload.sub;
  }
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
