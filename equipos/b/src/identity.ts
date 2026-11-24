import { createPublicKey, verify } from 'node:crypto';

export type PrivilegedRole = 'DOCENTE' | 'ADMINISTRADOR';
export interface IdentityConfig { jwksUrl: string; accountsUrl: string; issuer: string; audience: string; serviceToken: string; }
export interface Principal { userId: string; roles: PrivilegedRole[]; }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const roles = new Set<PrivilegedRole>(['DOCENTE', 'ADMINISTRADOR']);

// Deliberately use one generic error for bad credentials and unavailable providers.
export class IdentityError extends Error { constructor() { super('No se pudo verificar la identidad o los permisos'); } }

type JsonRecord = Record<string, unknown>;
function record(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new IdentityError();
  return value as JsonRecord;
}
function decode(part: string): JsonRecord {
  if (!/^[A-Za-z0-9_-]+$/.test(part)) throw new IdentityError();
  return record(JSON.parse(Buffer.from(part, 'base64url').toString('utf8')));
}
async function getJson(url: string, headers?: Record<string, string>): Promise<JsonRecord> {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(5000), redirect: 'error' });
  if (!response.ok) throw new IdentityError();
  return record(await response.json());
}

export async function authorizeTeacherOrAdmin(token: string, required: PrivilegedRole, config: IdentityConfig): Promise<Principal> {
  try {
    if (!config.serviceToken || token.length > 8192) throw new IdentityError();
    const parts = token.split('.');
    if (parts.length !== 3 || !parts.every(Boolean)) throw new IdentityError();
    const [encodedHeader, encodedClaims, encodedSignature] = parts;
    const header = decode(encodedHeader);
    const claims = decode(encodedClaims);
    if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid || !/^[A-Za-z0-9_-]+$/.test(encodedSignature)) throw new IdentityError();
    if (claims.iss !== config.issuer || !(claims.aud === config.audience || (Array.isArray(claims.aud) && claims.aud.includes(config.audience)))) throw new IdentityError();
    const now = Math.floor(Date.now() / 1000);
    if (typeof claims.exp !== 'number' || !Number.isFinite(claims.exp) || claims.exp <= now || (claims.nbf !== undefined && (typeof claims.nbf !== 'number' || claims.nbf > now))) throw new IdentityError();
    if (typeof claims.sub !== 'string' || !uuid.test(claims.sub) || !Array.isArray(claims.roles) || !claims.roles.includes(required)) throw new IdentityError();
    const jwks = await getJson(config.jwksUrl);
    if (!Array.isArray(jwks.keys)) throw new IdentityError();
    const matches = jwks.keys.filter((key: unknown) => { const k = record(key); return k.kid === header.kid && k.kty === 'RSA' && (k.alg === undefined || k.alg === 'RS256') && (k.use === undefined || k.use === 'sig'); });
    if (matches.length !== 1) throw new IdentityError();
    const publicKey = createPublicKey({ key: matches[0] as import('node:crypto').JsonWebKey, format: 'jwk' });
    if (!verify('RSA-SHA256', Buffer.from(`${encodedHeader}.${encodedClaims}`), publicKey, Buffer.from(encodedSignature, 'base64url'))) throw new IdentityError();
    const access = await getJson(`${config.accountsUrl.replace(/\/$/, '')}/${encodeURIComponent(claims.sub)}/access`, { authorization: `Bearer ${config.serviceToken}` });
    if (access.user_id !== claims.sub || access.status !== 'ACTIVA' || !Array.isArray(access.roles) || !access.roles.includes(required)) throw new IdentityError();
    return { userId: claims.sub, roles: access.roles.filter((role: unknown): role is PrivilegedRole => typeof role === 'string' && roles.has(role as PrivilegedRole)) };
  } catch { throw new IdentityError(); }
}
