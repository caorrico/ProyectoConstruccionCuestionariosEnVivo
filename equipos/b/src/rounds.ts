import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { Principal } from './identity';
import { publicQuestion, validateSnapshot } from './snapshot';
import { RoomError } from './rooms';

/** Opens exactly the next round. All timestamps come from PostgreSQL. */
export async function openNextRound(pool: Pool, principal: Principal, gameId: string) {
 if (!principal.roles.includes('DOCENTE')) throw new RoomError('No autorizado');
 const client = await pool.connect();
 try {
  await client.query('BEGIN');
  const games = await client.query('SELECT id, owner_id, quiz_id, snapshot, state FROM games WHERE id=$1 FOR UPDATE', [gameId]);
  const game = games.rows[0];
  if (!game || game.owner_id !== principal.userId) throw new RoomError('Partida no disponible');
  if (!['WAITING','ROUND_RANKING'].includes(game.state)) throw new RoomError('La partida no permite abrir una ronda');
  const snapshot = validateSnapshot(game.snapshot, game.quiz_id, game.owner_id);
  const previous = await client.query('SELECT count(*)::int AS n FROM rounds WHERE game_id=$1', [gameId]);
  const question = snapshot.questions[previous.rows[0].n];
  if (!question) throw new RoomError('No quedan preguntas');
  const roundId = randomUUID();
  const result = await client.query("INSERT INTO rounds(id,game_id,question_id,question_order,opens_at,closes_at) SELECT $1,$2,$3,$4,t,t+($5 * interval '1 second') FROM (SELECT clock_timestamp() AS t) c RETURNING opens_at,closes_at", [roundId,gameId,question.id,question.order,question.time_limit_seconds]);
  await client.query("UPDATE games SET state='QUESTION_OPEN', locked=true WHERE id=$1", [gameId]);
  await client.query('COMMIT');
  return { roundId, opensAt:result.rows[0].opens_at, closesAt:result.rows[0].closes_at, question:publicQuestion(question) };
 } catch (error) { await client.query('ROLLBACK'); throw error; }
 finally { client.release(); }
}
