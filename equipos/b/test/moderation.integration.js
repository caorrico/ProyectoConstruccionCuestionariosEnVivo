const {test}=require('node:test'); const assert=require('node:assert/strict'); const {Pool}=require('pg');
const {createRoom,joinRoom,setRoomLocked,expelParticipant}=require('../dist/rooms');
if(!process.env.TEST_DATABASE_URL) throw Error('Falta TEST_DATABASE_URL');
const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,max:10});
const owner='11111111-1111-4111-8111-111111111111',quiz='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',principal={userId:owner,roles:['DOCENTE']};
const fixture={quiz_id:quiz,owner_id:owner,version_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',title:'Prueba',questions:[{id:'00000000-0000-4000-8000-000000000001',order:1,prompt:'Ejemplo',time_limit_seconds:30,type:'TRUE_FALSE',data:{},correct_answer:{value:true}}]};
test('solo el propietario modera la sala y la expulsión revoca la sesión',async()=>{
 let room;
 try {
  room=await createRoom(pool,principal,quiz,fixture); const participant=await joinRoom(pool,room.pin,'Alumna');
  const stranger={userId:'22222222-2222-4222-8222-222222222222',roles:['DOCENTE']};
  await assert.rejects(setRoomLocked(pool,stranger,room.gameId,true)); await assert.rejects(expelParticipant(pool,stranger,room.gameId,participant.participantId));
  await setRoomLocked(pool,principal,room.gameId,true); await assert.rejects(joinRoom(pool,room.pin,'Nuevo'));
  await setRoomLocked(pool,principal,room.gameId,false); await expelParticipant(pool,principal,room.gameId,participant.participantId);
  const row=await pool.query('SELECT expelled_at,session_token_hash FROM participants WHERE id=$1',[participant.participantId]); assert.ok(row.rows[0].expelled_at); assert.equal(row.rows[0].session_token_hash,null);
  await assert.rejects(expelParticipant(pool,principal,room.gameId,participant.participantId)); await joinRoom(pool,room.pin,'Alumna');
 } finally { if(room) await pool.query('DELETE FROM games WHERE id=$1',[room.gameId]); await pool.end(); }
});
