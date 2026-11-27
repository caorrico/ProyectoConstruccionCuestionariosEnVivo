import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, KeyObject, randomUUID, sign } from 'node:crypto';

// Firma de JWT RS256 para el contrato v1 (JWKS en GET /api/v1/auth/jwks).
// La llave privada llega por JWT_PRIVATE_KEY (PEM); en desarrollo se genera una efímera.
export const FIRMADOR = Symbol('FIRMADOR');
// sv = version_sesion: al incrementarse, las sesiones anteriores dejan de valer.
export type ClaimsAcceso = { sub: string; roles: string[]; sv: number };

const b64 = (valor: unknown) => Buffer.from(JSON.stringify(valor)).toString('base64url');

export class FirmadorJwt {
  readonly jwk: Record<string, string>;

  constructor(
    private readonly llave: KeyObject,
    readonly emisor: string,
    readonly audiencia: string[],
    readonly vidaSegundos: number,
  ) {
    const { kty, n, e } = createPublicKey(llave).export({ format: 'jwk' }) as Record<string, string>;
    // kid = huella RFC 7638 de la llave pública: estable mientras la llave no cambie.
    const kid = createHash('sha256').update(JSON.stringify({ e, kty, n })).digest('base64url');
    this.jwk = { kty, n, e, kid, use: 'sig', alg: 'RS256' };
  }

  firmar(claims: ClaimsAcceso, ahora = Date.now()): string {
    const iat = Math.floor(ahora / 1000);
    const aud = this.audiencia.length === 1 ? this.audiencia[0] : this.audiencia;
    const payload = { iss: this.emisor, aud, ...claims, iat, exp: iat + this.vidaSegundos, jti: randomUUID() };
    const cuerpo = `${b64({ alg: 'RS256', typ: 'JWT', kid: this.jwk.kid })}.${b64(payload)}`;
    return `${cuerpo}.${sign('RSA-SHA256', Buffer.from(cuerpo), this.llave).toString('base64url')}`;
  }

  jwks = () => ({ keys: [this.jwk] });
}

export function firmadorDesdeEntorno(env: NodeJS.ProcessEnv = process.env): FirmadorJwt {
  const pem = env.JWT_PRIVATE_KEY?.replace(/\\n/g, '\n').trim();
  let llave: KeyObject;
  if (pem) {
    llave = createPrivateKey(pem);
    if (llave.asymmetricKeyType !== 'rsa') throw new Error('JWT_PRIVATE_KEY debe ser una llave RSA');
  } else if (env.NODE_ENV === 'production') {
    throw new Error('Defina JWT_PRIVATE_KEY en producción');
  } else {
    llave = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  }
  const audiencia = (env.JWT_AUDIENCE ?? 'cuestionarios-a,cuestionarios-b').split(',').map(a => a.trim()).filter(Boolean);
  const vida = Number(env.JWT_TTL_SECONDS ?? 900);
  if (!Number.isInteger(vida) || vida < 60 || vida > 3600) throw new Error('JWT_TTL_SECONDS debe estar entre 60 y 3600');
  return new FirmadorJwt(llave, env.JWT_ISSUER ?? 'http://localhost:3001', audiencia, vida);
}
