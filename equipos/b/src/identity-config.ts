import { IdentityConfig } from './identity';

/** Explicit settings keep A's real identity provider separate from the local simulator. */
export function identityConfigFromEnv(env: NodeJS.ProcessEnv): IdentityConfig {
 const jwksUrl=env.A_JWKS_URL, accountsUrl=env.A_ACCOUNTS_URL, issuer=env.A_JWT_ISSUER, audience=env.A_JWT_AUDIENCE, serviceToken=env.A_SERVICE_TOKEN;
 if(!jwksUrl || !accountsUrl || !issuer || !audience || !serviceToken || serviceToken.length<32 || /\s/.test(serviceToken)) throw new Error('Configuración de identidad incompleta o credencial de servicio inválida');
 for(const value of [jwksUrl,accountsUrl]) { const url=new URL(value); if(!['http:','https:'].includes(url.protocol) || (env.NODE_ENV==='production' && url.protocol!=='https:') || url.username || url.password || url.search || url.hash) throw new Error('URL de identidad inválida'); }
 return {jwksUrl,accountsUrl,issuer,audience,serviceToken};
}
