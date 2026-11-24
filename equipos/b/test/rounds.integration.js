const {test}=require('node:test'); const assert=require('node:assert/strict'); const {Pool}=require('pg');
const {createRoom}=require('../dist/rooms'); const {openNextRound}=require('../dist/rounds');
if(!process.env.TEST_DATABASE_URL) throw Error('Falta TEST_DATABASE_URL');
const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,max:10});
const owner='11111111-1111-4111-8111-111111111111', quiz='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const fixture={quiz_id:quiz,owner_id:owner,version_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',title:'Prueba',questions:[{id:'00000000-0000-4000-8000-000000000001',order:1,prompt:'Ejemplo',time_limit_seconds:30,type:'TRUE_FALSE',data:{},correct_answer:{value:true}}]};
test('apertura concurrente usa reloj de servidor y protege propiedad y solución',async()=>{
 let game;
 try {
  game=await createRoom(pool,{userId:owner,roles:['DOCENTE']},quiz,fixture);
  await assert.rejects(openNextRound(pool,{userId:'22222222-2222-4222-8222-222222222222',roles:['DOCENTE']},game.gameId));
  const attempts=await Promise.allSettled([openNextRound(pool,{userId:owner,roles:['DOCENTE']},game.gameId),openNextRound(pool,{userId:owner,roles:['DOCENTE']},game.gameId)]);
  const successful=attempts.filter(x=>x.status==='fulfilled'); assert.equal(successful.length,1); assert.equal(attempts.filter(x=>x.status==='rejected').length,1);
  const round=successful[0].value; assert.equal(round.closesAt-round.opensAt,30000); assert.equal(Object.hasOwn(round.question,'correct_answer'),false);
  const state=await pool.query('SELECT state,locked FROM games WHERE id=$1',[game.gameId]); assert.equal(state.rows[0].state,'QUESTION_OPEN'); assert.equal(state.rows[0].locked,true);
 } finally { if(game) await pool.query('DELETE FROM games WHERE id=$1',[game.gameId]); await pool.end(); }
});
