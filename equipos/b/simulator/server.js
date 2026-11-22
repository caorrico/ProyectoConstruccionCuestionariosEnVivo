const http = require('node:http');
const { generateKeyPairSync, sign, verify, randomUUID, timingSafeEqual } = require('node:crypto');
if (process.env.NODE_ENV !== 'development' || process.env.ALLOW_DEV_SIMULATOR !== 'true') throw Error('El simulador solo puede arrancar en desarrollo explícito');
const token = process.env.SERVICE_TOKEN;
if (!token || token.length < 20) throw Error('SERVICE_TOKEN de desarrollo obligatorio');
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format:'jwk' }), kid:'dev-ephemeral', use:'sig', alg:'RS256' };
const teacher = '11111111-1111-4111-8111-111111111111';
const suspended = '22222222-2222-4222-8222-222222222222';
const admin = '33333333-3333-4333-8333-333333333333';
const quiz = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const q = (n,type,data,correct_answer) => ({id:`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,order:n,prompt:`Pregunta de ejemplo ${n}`,time_limit_seconds:30,type,data,correct_answer});
const snapshot = {quiz_id:quiz,version_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',owner_id:teacher,title:'Cuestionario mixto de ejemplo',questions:[
 q(1,'SINGLE_CHOICE',{options:[{id:'a',text:'A'},{id:'b',text:'B'}]},{option_id:'a'}),
 q(2,'TRUE_FALSE',{}, {value:true}),
 q(3,'MULTIPLE_CHOICE',{options:[{id:'a',text:'A'},{id:'b',text:'B'},{id:'c',text:'C'}]},{option_ids:['a','c']}),
 q(4,'MATCHING',{left:[{id:'l1',text:'Cuentas'},{id:'l2',text:'Partidas'}],right:[{id:'r1',text:'Roles'},{id:'r2',text:'PIN'}]},{pairs:[{left_id:'l1',right_id:'r1'},{left_id:'l2',right_id:'r2'}]}),
 q(5,'SHORT_ANSWER',{}, {accepted_answers:['WebSocket','WebSockets']})]};
function jwt(sub,roles) { const now=Math.floor(Date.now()/1000); const b=x=>Buffer.from(JSON.stringify(x)).toString('base64url'); const body=`${b({alg:'RS256',typ:'JWT',kid:jwk.kid})}.${b({iss:'http://simulator-a:3000',aud:'cuestionarios-b',sub,roles,iat:now,exp:now+300,jti:randomUUID()})}`; return `${body}.${sign('RSA-SHA256',Buffer.from(body),privateKey).toString('base64url')}`; }
function authenticated(header) { try { const value=(header ?? '').match(/^Bearer (.+)$/)?.[1]; if (!value) return false; const parts=value.split('.'); if(parts.length!==3) return false; const claims=JSON.parse(Buffer.from(parts[1],'base64url')); return claims.iss==='http://simulator-a:3000' && claims.aud==='cuestionarios-b' && claims.exp>Math.floor(Date.now()/1000) && claims.sub===teacher && verify('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),publicKey,Buffer.from(parts[2],'base64url')); } catch { return false; } }
function equal(a,b) { const x=Buffer.from(a),y=Buffer.from(b); return x.length===y.length && timingSafeEqual(x,y); }
http.createServer((req,res)=>{ const url=new URL(req.url,'http://local'); const send=(status,body)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(body));};
 if(req.method!=='GET') return send(405,{error:'Método no permitido'});
 if(url.pathname==='/health') return send(200,{status:'ok'});
 if(url.pathname==='/api/v1/auth/jwks') return send(200,{keys:[jwk]});
 if(url.pathname==='/dev/token') { const role=url.searchParams.get('as'); if(!['teacher','admin','suspended'].includes(role)) return send(400,{error:'Identidad desconocida'}); const sub=role==='teacher'?teacher:role==='admin'?admin:suspended; return send(200,{access_token:jwt(sub,[role==='admin'?'ADMINISTRADOR':'DOCENTE'])}); }
 if(url.pathname.startsWith('/internal/')) { if(!equal(req.headers.authorization ?? '',`Bearer ${token}`)) return send(401,{error:'Credencial inválida'});
   const account=url.pathname.match(/^\/internal\/v1\/accounts\/([^/]+)\/access$/); if(account) { const id=account[1]; if(![teacher,admin,suspended].includes(id)) return send(404,{error:'No disponible'}); return send(200,{user_id:id,status:id===suspended?'SUSPENDIDA':'ACTIVA',roles:[id===admin?'ADMINISTRADOR':'DOCENTE']}); }
   if(url.pathname===`/internal/v1/quizzes/${quiz}/published-snapshot` && url.searchParams.get('owner_id')===teacher) return send(200,snapshot);
   return send(404,{error:'No disponible'});
 }
 if(url.pathname==='/api/v1/quizzes' && url.searchParams.get('status')==='PUBLICADO') { if (!authenticated(req.headers.authorization)) return send(401,{error:'No autorizado'}); return send(200,{items:[{quiz_id:quiz,title:snapshot.title}]}); }
 return send(404,{error:'No disponible'});
}).listen(Number(process.env.PORT || 3000),'0.0.0.0');
