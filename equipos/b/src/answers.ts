import { createHash, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { Question, validateSnapshot } from './snapshot';
import { RoomError } from './rooms';
type Obj = Record<string, unknown>;
function object(value: unknown): Obj | null { return value && typeof value==='object' && !Array.isArray(value) ? value as Obj : null; }
function ids(value: unknown): string[] { return Array.isArray(value) ? value.map(x=>object(x)?.id).filter((x): x is string => typeof x==='string') : []; }
function validAnswer(q: Question, value: unknown): boolean {
 const a=object(value); if(!a) return false;
 switch(q.type) {
 case 'TRUE_FALSE': return Object.keys(a).length===1 && typeof a.value==='boolean';
 case 'SINGLE_CHOICE': return Object.keys(a).length===1 && typeof a.option_id==='string' && ids(q.data.options).includes(a.option_id);
 case 'MULTIPLE_CHOICE': { if(Object.keys(a).length!==1 || !Array.isArray(a.option_ids) || a.option_ids.length<1) return false; const allowed=ids(q.data.options); return a.option_ids.every(x=>typeof x==='string' && allowed.includes(x)) && new Set(a.option_ids).size===a.option_ids.length; }
 case 'MATCHING': { if(Object.keys(a).length!==1 || !Array.isArray(a.pairs)) return false; const left=ids(q.data.left),right=ids(q.data.right); if(a.pairs.length!==left.length) return false; const pairs=a.pairs.map(object); if(pairs.some(p=>!p || Object.keys(p).length!==2 || typeof p.left_id!=='string' || typeof p.right_id!=='string' || !left.includes(p.left_id) || !right.includes(p.right_id))) return false; return new Set(pairs.map(p=>p!.left_id)).size===left.length && new Set(pairs.map(p=>p!.right_id)).size===right.length; }
 case 'SHORT_ANSWER': return Object.keys(a).length===1 && typeof a.text==='string' && !!a.text.trim() && a.text.length<=1000;
 default:return false;
 }
}
/** Must be called after transport-level rate limiting; participant token is never persisted in plaintext. */
export async function submitAnswer(pool: Pool, gameId: string, roundId: string, token: string, answer: unknown): Promise<{accepted: true}> {
 if(typeof token!=='string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new RoomError('Sesión no válida');
 const hash=createHash('sha256').update(token).digest('hex'); const client=await pool.connect();
 try {
  await client.query('BEGIN');
  const games=await client.query('SELECT id,owner_id,quiz_id,snapshot,state FROM games WHERE id=$1 FOR UPDATE',[gameId]);
  const game=games.rows[0]; if(!game || game.state!=='QUESTION_OPEN') throw new RoomError('Ronda no disponible');
  const p=await client.query('SELECT id FROM participants WHERE game_id=$1 AND session_token_hash=$2 AND expelled_at IS NULL',[gameId,hash]);
  if(!p.rowCount) throw new RoomError('Sesión no válida');
  const r=await client.query('SELECT id,question_id FROM rounds WHERE id=$1 AND game_id=$2 AND question_order=(SELECT max(question_order) FROM rounds WHERE game_id=$2)',[roundId,gameId]);
  const round=r.rows[0]; if(!round) throw new RoomError('Ronda no disponible');
  const q=validateSnapshot(game.snapshot,game.quiz_id,game.owner_id).questions.find(x=>x.id===round.question_id);
  if(!q || !validAnswer(q,answer)) throw new RoomError('Respuesta inválida');
  const inserted=await client.query("INSERT INTO answers(id,game_id,round_id,participant_id,answer,received_at) SELECT $1,$2,$3,$4,$5,t FROM rounds r CROSS JOIN (SELECT clock_timestamp() AS t) c WHERE r.id=$3 AND r.game_id=$2 AND t >= r.opens_at AND t < r.closes_at ON CONFLICT (round_id,participant_id) DO NOTHING RETURNING id",[randomUUID(),gameId,roundId,p.rows[0].id,JSON.stringify(answer)]);
  if(!inserted.rowCount) throw new RoomError('Respuesta tardía o ya recibida');
  await client.query('COMMIT'); return {accepted:true};
 } catch(error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}
