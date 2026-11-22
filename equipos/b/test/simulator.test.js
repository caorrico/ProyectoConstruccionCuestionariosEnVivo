const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createPublicKey, verify } = require('node:crypto');
const token='test-service-token-at-least-20';
test('proveedor simulado respeta identidad, acceso interno y snapshot', async () => {
  const port=34000+Math.floor(Math.random()*10000);
  const child=spawn(process.execPath,['simulator/server.js'],{env:{...process.env,NODE_ENV:'development',ALLOW_DEV_SIMULATOR:'true',SERVICE_TOKEN:token,PORT:String(port)}});
  const base=`http://127.0.0.1:${port}`;
  try {
    let ready=false; for(let i=0;i<100;i++) { try { const r=await fetch(base+'/health'); if(r.ok) {ready=true;break;} } catch {} await new Promise(r=>setTimeout(r,100)); }
    assert.ok(ready,'simulador no arrancó');
    const get=(path,authorization)=>fetch(base+path,{headers:authorization?{authorization}: {}});
    const jwks=await (await get('/api/v1/auth/jwks')).json();
    const creds=await (await get('/dev/token?as=teacher')).json();
    const [h,b,s]=creds.access_token.split('.');
    assert.ok(verify('RSA-SHA256',Buffer.from(h+'.'+b),createPublicKey({key:jwks.keys[0],format:'jwk'}),Buffer.from(s,'base64url')));
    const claims=JSON.parse(Buffer.from(b,'base64url')); assert.equal(claims.aud,'cuestionarios-b'); assert.equal(claims.sub,'11111111-1111-4111-8111-111111111111'); assert.ok(claims.exp>Math.floor(Date.now()/1000));
    assert.equal((await get('/api/v1/quizzes?status=PUBLICADO')).status,401);
    assert.equal((await get('/api/v1/quizzes?status=PUBLICADO','Bearer '+creds.access_token)).status,200);
    const path='/internal/v1/accounts/'+claims.sub+'/access';
    assert.equal((await get(path)).status,401); assert.equal((await get(path,'Bearer wrong')).status,401);
    assert.equal((await (await get(path,'Bearer '+token)).json()).status,'ACTIVA');
    const suspendedId='22222222-2222-4222-8222-222222222222';
    const suspendedToken=(await (await get('/dev/token?as=suspended')).json()).access_token;
    assert.equal((await get('/api/v1/quizzes?status=PUBLICADO','Bearer '+suspendedToken)).status,401);
    const access=await (await get('/internal/v1/accounts/'+suspendedId+'/access','Bearer '+token)).json();
    assert.deepEqual(access,{user_id:suspendedId,status:'SUSPENDIDA',roles:['DOCENTE']});
    assert.equal((await get('/internal/v1/accounts/44444444-4444-4444-8444-444444444444/access','Bearer '+token)).status,404);
    const snapshot='/internal/v1/quizzes/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/published-snapshot?owner_id='+claims.sub;
    assert.equal((await get(snapshot)).status,401);
    assert.equal((await get(snapshot,'Bearer incorrect')).status,401);
    const privateQuiz=snapshot.replace('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','cccccccc-cccc-4ccc-8ccc-cccccccccccc');
    assert.equal((await get(privateQuiz,'Bearer '+token)).status,404);
    const body=await (await get(snapshot,'Bearer '+token)).json();
    assert.equal(body.owner_id,claims.sub);
    assert.deepEqual(body.questions.map(q=>q.order),[1,2,3,4,5]);
    assert.deepEqual(body.questions.map(q=>q.type),['SINGLE_CHOICE','TRUE_FALSE','MULTIPLE_CHOICE','MATCHING','SHORT_ANSWER']);
    assert.equal((await get(snapshot.replace(claims.sub,'22222222-2222-4222-8222-222222222222'),'Bearer '+token)).status,404);
  } finally { child.kill(); }
});
for (const mode of ['production','staging']) test(`simulador rechaza ${mode}`, async()=>{ const child=spawn(process.execPath,['simulator/server.js'],{env:{...process.env,NODE_ENV:mode,ALLOW_DEV_SIMULATOR:'true',SERVICE_TOKEN:token},stdio:'ignore'}); const code=await new Promise(resolve=>child.on('exit',resolve)); assert.notEqual(code,0); });
