const encoder=new TextEncoder();
export const COOKIE='__Host-te_stats', SESSION_SECONDS=43200;
export function authConfig(env){
 const email=env.OWNER_EMAIL?.trim().toLowerCase(), password=env.OWNER_PASSWORD;
 return typeof email==='string'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)&&typeof password==='string'&&password.length>=16&&password.length<=256?{email,password}:null;
}
const bytes=value=>encoder.encode(value);
const encode=value=>btoa(String.fromCharCode(...new Uint8Array(value))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const decode=value=>Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
const digest=async value=>new Uint8Array(await crypto.subtle.digest('SHA-256',bytes(value)));
export async function checkCredentials(email,password,config){
 if(typeof email!=='string'||typeof password!=='string'||email.length>254||password.length>256||!config)return false;
 const [actual,expected]=await Promise.all([digest(JSON.stringify([email.trim().toLowerCase(),password])),digest(JSON.stringify([config.email,config.password]))]);
 let different=0;for(let i=0;i<actual.length;i++)different|=actual[i]^expected[i];return different===0;
}
async function signingKey(config){return crypto.subtle.importKey('raw',await digest('TE GROUP statistics session v1\0'+JSON.stringify([config.email,config.password])),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
export async function createSession(config,now=Math.floor(Date.now()/1000)){
 const payload=encode(bytes(JSON.stringify({v:1,iat:now,exp:now+SESSION_SECONDS,nonce:crypto.randomUUID()})));
 return payload+'.'+encode(await crypto.subtle.sign('HMAC',await signingKey(config),bytes(payload)));
}
export async function verifySession(token,config,now=Math.floor(Date.now()/1000)){
 if(!config||typeof token!=='string'||token.length>1024||!/^[-\w]+\.[-\w]+$/.test(token))return false;
 try{
  const [body,signature]=token.split('.');if(!await crypto.subtle.verify('HMAC',await signingKey(config),decode(signature),bytes(body)))return false;
  const p=JSON.parse(new TextDecoder().decode(decode(body)));
  return p.v===1&&Number.isSafeInteger(p.iat)&&Number.isSafeInteger(p.exp)&&p.iat<=now&&p.exp>now&&p.exp-p.iat===SESSION_SECONDS&&typeof p.nonce==='string'&&p.nonce.length===36;
 }catch{return false;}
}
export async function isOwner(request,env){
 const values=(request.headers.get('Cookie')||'').split(';').map(s=>s.trim()).filter(s=>s.startsWith(COOKIE+'='));
 return values.length===1&&verifySession(values[0].slice(COOKIE.length+1),authConfig(env));
}
export const sessionCookie=token=>`${COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${token?SESSION_SECONDS:0}`;
