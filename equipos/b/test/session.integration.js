const {test}=require('node:test'); const assert=require('node:assert/strict'); const {Pool}=require('pg');
const {createRoom,joinRoom,resumeParticipant,expelParticipant}=require('../dist/rooms'); const {openNextRound}=require('../dist/rounds'); const {submitAnswer}=require('../dist/answers');
if(!process.env.TEST_DATABASE_URL) throw Error('Falta TEST_DATABASE_URL'); const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL});
const owner='11111111-1111-4111-8111-111111111111',quiz='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',principal={userId:owner,roles:['DOCENTE']};
const fixture={quiz_id:quiz,owner_id:owner,version_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',title:'Prueba',questions:[{id:'00000000-0000-4000-8000-000000000001',order:1,prompt:'Ejemplo',time_limit_seconds:30,type:'TRUE_FALSE',data:{},correct_answer:{value:true}}]};
test('reconexión comprueba secreto, vencimiento y expulsión sin revelar soluciones',async()=>{
 let game;
 try {
  game=await createRoom(pool,principal,quiz,fixture); const one=await joinRoom(pool,game.pin,'Alumna'); const two=await joinRoom(pool,game.pin,'Segundo');
  const resumed=await resumeParticipant(pool,game.gameId,one.token); assert.deepEqual(resumed,{participantId:one.participantId,nickname:'Alumna',state:'WAITING'});
  await assert.rejects(resumeParticipant(pool,game.gameId,'X'.repeat(43)),/Sesión/);
  await expelParticipant(pool,principal,game.gameId,two.participantId); await assert.rejects(resumeParticipant(pool,game.gameId,two.token),/Sesión/);
  const round=await openNextRound(pool,principal,game.gameId); assert.equal((await resumeParticipant(pool,game.gameId,one.token)).state,'QUESTION_OPEN');
  await pool.query("UPDATE participants SET session_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[one.participantId]);
  await assert.rejects(resumeParticipant(pool,game.gameId,one.token),/Sesión/); await assert.rejects(submitAnswer(pool,game.gameId,round.roundId,one.token,{value:true}),/Sesión/);
 } finally { if(game) await pool.query('DELETE FROM games WHERE id=$1',[game.gameId]); await pool.end(); }
});
