import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { Principal } from './identity';
import { validateSnapshot } from './snapshot';

export class RoomError extends Error { constructor(message: string) { super(message); } }
const forbidden = new Set(['puta','puto','mierda','idiota','imbecil']);
export function validNickname(value: unknown): value is string {
 if(typeof value !== 'string' || value !== value.trim() || !/^[\p{L}\p{N}_ -]{3,15}$/u.test(value)) return false;
 const normalized=value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 return !normalized.split(/[^a-z0-9]+/).some(word=>forbidden.has(word));
}
function hashToken(token: string): string { return createHash('sha256').update(token).digest('hex'); }
export async function createRoom(pool: Pool, principal: Principal, quizId: string, rawSnapshot: unknown): Promise<{gameId:string;pin:string}> {
 if(!principal.roles.includes('DOCENTE')) throw new RoomError('No autorizado');
 const snapshot=validateSnapshot(rawSnapshot,quizId,principal.userId);
 for(let attempt=0;attempt<20;attempt++) {
  const gameId=randomUUID(), pin=String(randomInt(1_000_000)).padStart(6,'0');
  try { await pool.query("INSERT INTO games(id,owner_id,quiz_id,version_id,snapshot,pin,state) VALUES($1,$2,$3,$4,$5,$6,'WAITING')",[gameId,principal.userId,quizId,snapshot.version_id,JSON.stringify(snapshot),pin]); return {gameId,pin}; }
  catch(error) { const e=error as {code?:string;constraint?:string}; if(e.code!=='23505' || e.constraint!=='games_active_pin') throw error; }
 }
 throw new RoomError('No fue posible asignar un PIN');
}
export async function joinRoom(pool: Pool, pin: string, nickname: unknown): Promise<{participantId:string;gameId:string;token:string}> {
 if(!/^\d{6}$/.test(pin) || !validNickname(nickname)) throw new RoomError('PIN o apodo inválido');
 const client=await pool.connect();
 try {
  await client.query('BEGIN');
  const result=await client.query("SELECT id, locked, state FROM games WHERE pin=$1 FOR UPDATE",[pin]);
  const game=result.rows[0];
  if(!game || game.state!=='WAITING' || game.locked) throw new RoomError('La sala no está disponible');
  const count=await client.query('SELECT count(*)::int AS n FROM participants WHERE game_id=$1 AND expelled_at IS NULL',[game.id]);
  if(count.rows[0].n>=30) throw new RoomError('La sala está llena');
  const participantId=randomUUID(), token=randomBytes(32).toString('base64url');
  await client.query("INSERT INTO participants(id,game_id,nickname,session_token_hash,session_expires_at) VALUES($1,$2,$3,$4,clock_timestamp()+interval '12 hours')",[participantId,game.id,nickname,hashToken(token)]);
  await client.query('COMMIT'); return {participantId,gameId:game.id,token};
 } catch(error) {
  await client.query('ROLLBACK');
  const e=error as {code?:string;constraint?:string};
  if(e.code==='23505' && e.constraint==='participants_nickname') throw new RoomError('El apodo ya está en uso');
  throw error;
 } finally { client.release(); }
}

/** Caller must supply a principal verified against the identity provider. */
export async function setRoomLocked(pool: Pool, principal: Principal, gameId: string, locked: boolean): Promise<void> {
 if(!principal.roles.includes('DOCENTE') || typeof locked!=='boolean') throw new RoomError('No autorizado');
 const result=await pool.query("UPDATE games SET locked=$3 WHERE id=$1 AND owner_id=$2 AND state='WAITING' RETURNING id",[gameId,principal.userId,locked]);
 if(!result.rowCount) throw new RoomError('Partida no disponible');
}
export async function expelParticipant(pool: Pool, principal: Principal, gameId: string, participantId: string): Promise<void> {
 if(!principal.roles.includes('DOCENTE')) throw new RoomError('No autorizado');
 const client=await pool.connect();
 try {
  await client.query('BEGIN');
  const game=await client.query("SELECT id FROM games WHERE id=$1 AND owner_id=$2 AND state='WAITING' FOR UPDATE",[gameId,principal.userId]);
  if(!game.rowCount) throw new RoomError('Partida no disponible');
  const result=await client.query('UPDATE participants SET expelled_at=clock_timestamp(), session_token_hash=NULL, session_expires_at=NULL WHERE id=$1 AND game_id=$2 AND expelled_at IS NULL RETURNING id',[participantId,gameId]);
  if(!result.rowCount) throw new RoomError('Participante no disponible');
  await client.query('COMMIT');
 } catch(error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

/** Resume with the original bearer secret; returns no snapshot, PIN or solution. */
export async function resumeParticipant(pool: Pool, gameId: string, token: string): Promise<{participantId:string;nickname:string;state:string}> {
 if(typeof token!=='string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new RoomError('Sesión no válida');
 const result=await pool.query(`SELECT p.id,p.nickname,g.state FROM participants p JOIN games g ON g.id=p.game_id WHERE p.game_id=$1 AND p.session_token_hash=$2 AND p.expelled_at IS NULL AND p.session_expires_at>clock_timestamp()`,[gameId,hashToken(token)]);
 if(!result.rowCount) throw new RoomError('Sesión no válida');
 return {participantId:result.rows[0].id,nickname:result.rows[0].nickname,state:result.rows[0].state};
}
