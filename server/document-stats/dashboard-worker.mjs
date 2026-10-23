import {isOwner,authConfig,checkCredentials,createSession,sessionCookie} from './dashboard-auth.mjs';
import {readReport,periodFor} from './dashboard-report.mjs';
import html from './dashboard/index.html';
import loginHtml from './dashboard/login.html';
import css from './dashboard/style.css';
import js from './dashboard/app.js';
import loginJs from './dashboard/login.js';
const prefix='/owner/statistics';
const headers={'Cache-Control':'private, no-store, max-age=0','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','X-Robots-Tag':'noindex, nofollow, noarchive','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"};
async function boundedJson(request){
 if(Number(request.headers.get('Content-Length')||0)>2048)throw Error();
 const reader=request.body?.getReader();if(!reader)throw Error();let size=0,parts=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2048){await reader.cancel();throw Error();}parts.push(value);}}finally{reader.releaseLock();}
 const data=new Uint8Array(size);let offset=0;for(const part of parts){data.set(part,offset);offset+=part.length;}return JSON.parse(new TextDecoder().decode(data));
}
export function createDashboardHandler(authorize=isOwner){return {async fetch(request,env){
 const url=new URL(request.url),path=url.pathname;
 const reply=(body,status=200,type='text/plain; charset=utf-8',extra={})=>new Response(body,{status,headers:{...headers,'Content-Type':type,...extra}});
 const json=(value,status=200,extra={})=>reply(JSON.stringify(value),status,'application/json; charset=utf-8',extra);
 const redirect=()=>new Response(null,{status:302,headers:{...headers,Location:prefix+'/login'}});
 if(url.hostname!=='tegroup.cc'||![prefix,prefix+'/',prefix+'/login',prefix+'/logout',prefix+'/style.css',prefix+'/app.js',prefix+'/login.js',prefix+'/report'].includes(path))return reply('Not found',404);
 if(request.method==='GET'&&path===prefix+'/style.css')return reply(css,200,'text/css; charset=utf-8');
 if(request.method==='GET'&&path===prefix+'/login.js')return reply(loginJs,200,'text/javascript; charset=utf-8');
 if(request.method==='GET'&&path===prefix+'/login')return reply(loginHtml,200,'text/html; charset=utf-8');
 if(request.method==='POST'&&(path===prefix+'/login'||path===prefix+'/logout')){
  if(request.headers.get('Origin')!=='https://tegroup.cc')return json({error:'Недопустимый запрос.'},403);
  if(path===prefix+'/logout')return json({ok:true},200,{'Set-Cookie':sessionCookie('')});
  const config=authConfig(env);if(!config||!env.LOGIN_LIMITER)return json({error:'Доступ ещё настраивается.'},503);
  try{if(!(await env.LOGIN_LIMITER.limit({key:'owner-login-v1'})).success)return json({error:'Слишком много попыток. Повторите через минуту.'},429,{'Retry-After':'60'});}catch{return json({error:'Вход временно недоступен.'},503);}
  if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))return json({error:'Недопустимый запрос.'},415);
  let data;try{data=await boundedJson(request);if(!data||Array.isArray(data)||Object.keys(data).sort().join(',')!=='email,password'||typeof data.email!=='string'||typeof data.password!=='string')throw Error();}catch{return json({error:'Некорректные данные входа.'},400);}
  if(!await checkCredentials(data.email,data.password,config))return json({error:'Неверный email или пароль.'},401);
  return json({ok:true},200,{'Set-Cookie':sessionCookie(await createSession(config))});
 }
 if(request.method!=='GET')return reply('Method not allowed',405);
 if(path===prefix+'/logout')return reply('Method not allowed',405);
 if(!authConfig(env))return json({error:'Доступ ещё настраивается.'},503);
 if(!await authorize(request,env))return path===prefix||path===prefix+'/'?redirect():json({error:'Войдите в кабинет.'},401);
 if(path===prefix)return new Response(null,{status:302,headers:{...headers,Location:prefix+'/'}});
 if(path===prefix+'/')return reply(html,200,'text/html; charset=utf-8');
 if(path===prefix+'/app.js')return reply(js,200,'text/javascript; charset=utf-8');
 try{periodFor(url.searchParams);}catch{return json({error:'Выберите корректный день или месяц.'},400);}
 if(!env.STATS_DB)return json({error:'Статистика временно недоступна.'},503);
 try{return json(await readReport(env.STATS_DB,url.searchParams));}catch{return json({error:'Не удалось обновить статистику. Попробуйте ещё раз.'},503);}
}};}
export default createDashboardHandler();
