const {test}=require('node:test'); const assert=require('node:assert/strict');
const {spawn}=require('node:child_process'); const {createServer}=require('node:net');
const {identityConfigFromEnv}=require('../dist/identity-config'); const {authorizeTeacherOrAdmin}=require('../dist/identity');
const base=process.env.A_TEST_URL, serviceToken=process.env.A_SERVICE_TOKEN;
if(!base || !serviceToken || !process.env.A_TEST_TEACHER_PASSWORD) throw Error('Faltan variables de integración A');
const config=identityConfigFromEnv({A_JWKS_URL:base+'/api/v1/auth/jwks',A_ACCOUNTS_URL:base+'/internal/v1/accounts',A_JWT_ISSUER:base,A_JWT_AUDIENCE:'cuestionarios-b',A_SERVICE_TOKEN:serviceToken});
test('B verifica la cookie de login de M1 real con JWKS y acceso interno',async()=>{
 const login=await fetch(base+'/api/v1/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({correo:'docente@espe.edu.ec',contrasena:process.env.A_TEST_TEACHER_PASSWORD})});
 assert.equal(login.status,200); const body=await login.json(); const cookies=login.headers.getSetCookie();
 const access=cookies.find(x=>x.startsWith('cv_acceso=')); assert.ok(access && /HttpOnly/i.test(access));
 const token=access.slice('cv_acceso='.length).split(';')[0];
 const principal=await authorizeTeacherOrAdmin(token,'DOCENTE',config); assert.equal(principal.userId,body.user_id); assert.ok(principal.roles.includes('DOCENTE'));
 await assert.rejects(authorizeTeacherOrAdmin(token,'ADMINISTRADOR',config));
 await assert.rejects(authorizeTeacherOrAdmin(token,'DOCENTE',{...config,serviceToken:'X'.repeat(32)}));
 await assert.rejects(authorizeTeacherOrAdmin(token,'DOCENTE',{...config,issuer:'https://issuer-invalido'}));
 const port=await new Promise((resolve,reject)=>{const server=createServer(); server.once('error',reject); server.listen(0,'127.0.0.1',()=>{const port=server.address().port; server.close(()=>resolve(port));});});
 const child=spawn(process.execPath,['dist/main.js'],{env:{...process.env,SERVICE_NAME:'m3',PORT:String(port),A_JWKS_URL:config.jwksUrl,A_ACCOUNTS_URL:config.accountsUrl,A_JWT_ISSUER:config.issuer,A_JWT_AUDIENCE:config.audience},stdio:'inherit'});
 try {
  let response; for(let i=0;i<500;i++){try{response=await fetch(`http://127.0.0.1:${port}/api/v1/games/session`,{headers:{cookie:'cv_acceso='+token}}); break;}catch{await new Promise(r=>setTimeout(r,100));}}
  assert.ok(response,'B no arrancó'); assert.equal(response.status,200); assert.equal((await response.json()).user_id,body.user_id);
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/v1/games/session`)).status,401);
 } finally {child.kill();}
});

