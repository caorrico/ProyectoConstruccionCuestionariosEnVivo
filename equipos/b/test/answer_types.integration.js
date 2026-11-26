const {test}=require('node:test'); const assert=require('node:assert/strict'); const {Pool}=require('pg');
const {createRoom,joinRoom}=require('../dist/rooms'); const {openNextRound}=require('../dist/rounds'); const {submitAnswer}=require('../dist/answers');
if(!process.env.TEST_DATABASE_URL) throw Error('Falta TEST_DATABASE_URL');
const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,max:10});
const owner='11111111-1111-4111-8111-111111111111',quiz='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', principal={userId:owner,roles:['DOCENTE']};
const opts=['a','b','c'].map(id=>({id,text:id}));
const cases=[
 ['SINGLE_CHOICE',{options:opts},{option_id:'a'},{option_id:'b'},{option_id:'z'}],
 ['TRUE_FALSE',{},{value:true},{value:false},{value:'false'}],
 ['MULTIPLE_CHOICE',{options:opts},{option_ids:['a','c']},{option_ids:['a','b']},{option_ids:['a','a']}],
 ['MATCHING',{left:[{id:'l1',text:'A'},{id:'l2',text:'B'}],right:[{id:'r1',text:'C'},{id:'r2',text:'D'}]},{pairs:[{left_id:'l1',right_id:'r1'},{left_id:'l2',right_id:'r2'}]},{pairs:[{left_id:'l1',right_id:'r2'},{left_id:'l2',right_id:'r1'}]},{pairs:[{left_id:'l1',right_id:'r1'},{left_id:'l2',right_id:'r1'}]}],
 ['SHORT_ANSWER',{},{accepted_answers:['WebSocket']},{text:'texto incorrecto'},{text:'   '}]
];
test('valida respuestas de cinco tipos sin calificar durante la ronda',async()=>{
 const games=[];
 try {
  for(const [type,data,correct_answer,valid,invalid] of cases){
   const snapshot={quiz_id:quiz,owner_id:owner,version_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',title:'Prueba',questions:[{id:'00000000-0000-4000-8000-000000000001',order:1,prompt:'Ejemplo',time_limit_seconds:30,type,data,correct_answer}]};
   const room=await createRoom(pool,principal,quiz,snapshot); games.push(room.gameId);
   const participant=await joinRoom(pool,room.pin,'Alumna'); const round=await openNextRound(pool,principal,room.gameId);
   await assert.rejects(submitAnswer(pool,room.gameId,round.roundId,participant.token,invalid),/inválida/);
   assert.deepEqual(await submitAnswer(pool,room.gameId,round.roundId,participant.token,valid),{accepted:true});
   const saved=await pool.query('SELECT answer FROM answers WHERE game_id=$1',[room.gameId]); assert.deepEqual(saved.rows[0].answer,valid);
  }
 } finally { for(const game of games) await pool.query('DELETE FROM games WHERE id=$1',[game]); await pool.end(); }
});
