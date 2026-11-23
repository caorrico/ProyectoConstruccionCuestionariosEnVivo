const {test}=require('node:test'); const assert=require('node:assert/strict'); const {Pool}=require('pg'); const {createRoom,joinRoom,validNickname}=require('../dist/rooms');
const url=process.env.TEST_DATABASE_URL;
if(!url) throw Error('Defina TEST_DATABASE_URL para ejecutar la prueba de integración');
const pool=new Pool({connectionString:url,max:40});
const owner='11111111-1111-4111-8111-111111111111',quiz='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const fixture={quiz_id:quiz,owner_id:owner,version_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',title:'Prueba',questions:[{id:'00000000-0000-4000-8000-000000000001',order:1,prompt:'Ejemplo',time_limit_seconds:30,type:'TRUE_FALSE',data:{},correct_answer:{value:true}}]};
test('salas serializan ingreso concurrente y evitan apodos repetidos',async()=>{
 let ids=[];
 try {
  assert.equal(validNickname('  abc'),false); assert.equal(validNickname('idiota'),false); assert.equal(validNickname('Ana Pérez'),true);
  const room=await createRoom(pool,{userId:owner,roles:['DOCENTE']},quiz,fixture); ids.push(room.gameId); assert.match(room.pin,/^\d{6}$/);
  const attempts=await Promise.allSettled(Array.from({length:35},(_,i)=>joinRoom(pool,room.pin,'Alumno'+i)));
  assert.equal(attempts.filter(x=>x.status==='fulfilled').length,30);
  assert.equal(attempts.filter(x=>x.status==='rejected').length,5);
  const rows=await pool.query('SELECT session_token_hash FROM participants WHERE game_id=$1',[room.gameId]); assert.equal(rows.rowCount,30);
  for(const entry of attempts.filter(x=>x.status==='fulfilled')) assert.ok(!rows.rows.some(row=>row.session_token_hash===entry.value.token));
  const second=await createRoom(pool,{userId:owner,roles:['DOCENTE']},quiz,fixture); ids.push(second.gameId);
  const duplicate=await Promise.allSettled([joinRoom(pool,second.pin,'Alumna'),joinRoom(pool,second.pin,'alumna')]);
  assert.equal(duplicate.filter(x=>x.status==='fulfilled').length,1);
  await pool.query('UPDATE games SET locked=true WHERE id=$1',[second.gameId]);
  await assert.rejects(joinRoom(pool,second.pin,'Nueva'),/no está disponible/);
 } finally { for(const id of ids) await pool.query('DELETE FROM games WHERE id=$1',[id]); await pool.end(); }
});
