import { createHash, randomBytes } from 'node:crypto';
import type { ClientBase } from 'pg';

export type Proposito = 'VERIFICACION' | 'RECUPERACION';

export const VIGENCIA_HORAS: Record<Proposito, number> = { VERIFICACION: 24, RECUPERACION: 1 };

export const hashToken = (token: string): string => createHash('sha256').update(token, 'utf8').digest('hex');

// En una sola sentencia invalida los enlaces anteriores del mismo propósito y crea uno nuevo.
// Devuelve el token en claro: solo viaja en el correo; en la base queda su hash.
export async function emitirToken(db: Pick<ClientBase, 'query'>, usuarioId: string, proposito: Proposito) {
  const token = randomBytes(32).toString('base64url');
  await db.query(
    `WITH anteriores AS (
       UPDATE tokens SET usado_en = now() WHERE usuario_id = $1 AND proposito = $2 AND usado_en IS NULL
     )
     INSERT INTO tokens (usuario_id, proposito, hash_token, expira_en)
     VALUES ($1, $2, $3, now() + make_interval(hours => $4))`,
    [usuarioId, proposito, hashToken(token), VIGENCIA_HORAS[proposito]],
  );
  return token;
}
