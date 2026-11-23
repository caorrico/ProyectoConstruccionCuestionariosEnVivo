const { test } = require('node:test');
const assert = require('node:assert/strict');
const { generateKeyPairSync, sign } = require('node:crypto');
const { authorizeTeacherOrAdmin, IdentityError } = require('../dist/identity');
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const userId='11111111-1111-4111-8111-111111111111';
const config={jwksUrl:'https://issuer.test/jwks',accountsUrl:'https://issuer.test/internal/v1/accounts',issuer:'https://issuer.test',audience:'cuestionarios-b',serviceToken:'prueba-entre-servicios'};
const jwk={...publicKey.export({format:'jwk'}),kid:'key1',alg:'RS256',use:'sig'};
const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
function makeToken(changes={}, header={alg:'RS256',kid:'key1'}, key=privateKey) {
 const claims={iss:config.issuer,aud:config.audience,sub:userId,exp:Math.floor(Date.now()/1000)+300,roles:['DOCENTE'],...changes};
 const data=encode(header)+'.'+encode(claims); return data+'.'+sign('RSA-SHA256',Buffer.from(data),key).toString('base64url');
}
const originalFetch=global.fetch;
test('comprueba firma, claims y acceso efectivo antes de autorizar',async()=>{
 let state='ACTIVA'; let actualRoles=['DOCENTE']; let calls=[];
 global.fetch=async (url,options)=>{ calls.push([url,options]);
   if(url===config.jwksUrl) return Response.json({keys:[jwk]});
   assert.equal(options.headers.authorization,'Bearer '+config.serviceToken);
   if(state==='DOWN') throw Error('servicio inaccesible');
   return Response.json({user_id:userId,status:state,roles:actualRoles});
 };
 try {
   assert.deepEqual(await authorizeTeacherOrAdmin(makeToken(),'DOCENTE',config),{userId,roles:['DOCENTE']});
   assert.equal(calls.length,2);
   state='SUSPENDIDA'; await assert.rejects(authorizeTeacherOrAdmin(makeToken(),'DOCENTE',config),IdentityError);
   state='ACTIVA'; actualRoles=[]; await assert.rejects(authorizeTeacherOrAdmin(makeToken(),'DOCENTE',config),IdentityError);
   state='DOWN'; actualRoles=['DOCENTE']; await assert.rejects(authorizeTeacherOrAdmin(makeToken(),'DOCENTE',config),IdentityError);
   state='ACTIVA';
   const other=generateKeyPairSync('rsa',{modulusLength:2048});
   for (const token of [makeToken({exp:1}),makeToken({iss:'https://otro'}),makeToken({aud:'otra'}),makeToken({sub:'no-uuid'}),makeToken({roles:['ADMINISTRADOR']}),makeToken({}, {alg:'none',kid:'key1'}),makeToken({},undefined,other.privateKey),'invalido']) {
     await assert.rejects(authorizeTeacherOrAdmin(token,'DOCENTE',config),IdentityError);
   }
 } finally { global.fetch=originalFetch; }
});
