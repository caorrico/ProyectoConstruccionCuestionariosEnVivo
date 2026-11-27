const {test}=require('node:test'); const assert=require('node:assert/strict'); const {identityConfigFromEnv}=require('../dist/identity-config');
test('la configuración de A requiere URLs y credencial de servicio válida',()=>{
 const env={A_JWKS_URL:'http://m1:3000/api/v1/auth/jwks',A_ACCOUNTS_URL:'http://m1:3000/internal/v1/accounts',A_JWT_ISSUER:'http://localhost:3001',A_JWT_AUDIENCE:'cuestionarios-b',A_SERVICE_TOKEN:'s'.repeat(32)};
 assert.equal(identityConfigFromEnv(env).issuer,env.A_JWT_ISSUER);
 assert.throws(()=>identityConfigFromEnv({...env,NODE_ENV:'production'}));
 for(const invalid of [{A_SERVICE_TOKEN:'corta'},{A_ACCOUNTS_URL:'file:///secretos'},{A_JWKS_URL:'http://usuario:clave@m1/'},{A_JWT_AUDIENCE:''}]) assert.throws(()=>identityConfigFromEnv({...env,...invalid}));
});
