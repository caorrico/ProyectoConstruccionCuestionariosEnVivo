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
  await client.query('INSERT INTO participants(id,game_id,nickname,session_token_hash) VALUES($1,$2,$3,$4)',[participantId,game.id,nickname,hashToken(token)]);
  await client.query('COMMIT'); return {participantId,gameId:game.id,token};
 } catch(error) {
  await client.query('ROLLBACK');
  const e=error as {code?:string;constraint?:string};
  if(e.code==='23505' && e.constraint==='participants_nickname') throw new RoomError('El apodo ya está en uso');
  throw error;
 } finally { client.release(); }
}
