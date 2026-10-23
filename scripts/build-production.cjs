const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {minify}=require('terser'),obfuscator=require('javascript-obfuscator');
const root=path.resolve(__dirname,'..');
if(!process.env.TE_SOURCE_DIR)throw Error('Set TE_SOURCE_DIR to the non-public editable source directory.');
const source=path.resolve(process.env.TE_SOURCE_DIR);
if(source===root)throw Error('Use a separate source directory to avoid obfuscating compiled files.');
const own=['app','payment-instructions','premium-pdf','local-documents','pdf-preview','public-config','https-only','document-flow','balance-invoice','balance-ui','order-documents','order-balance'];
const settings={target:'browser-no-eval',compact:true,controlFlowFlattening:false,deadCodeInjection:false,debugProtection:false,disableConsoleOutput:false,identifierNamesGenerator:'hexadecimal',renameGlobals:false,renameProperties:false,selfDefending:false,simplify:true,sourceMap:false,stringArray:true,stringArrayEncoding:['base64'],stringArrayThreshold:.7,unicodeEscapeSequence:false,seed:20261012};
async function protect(code,name){
 const min=await minify(code,{compress:{passes:2},mangle:true,format:{comments:false},sourceMap:false});
 const prefix='_te'+crypto.createHash('sha256').update(name).digest('hex').slice(0,8)+'_';
 const result=obfuscator.obfuscate(min.code,{...settings,identifiersPrefix:prefix,ignoreImports:true}).getObfuscatedCode();
 return '/* TE GROUP production build. Obfuscation is not access control. */\n'+result+'\n';
}
(async()=>{
 for(const name of own){let code=fs.readFileSync(path.join(source,'auto-src',name+'.js'),'utf8');
  if(name==='app')code=code.replace(/^\$\('documentTestFill'\)\.addEventListener\([^\n]+\n/m,'');
  fs.writeFileSync(path.join(root,'auto-src',name+'.js'),await protect(code,name));
 }
 const docFiles=['vendor','settings','watermark-assets','premium-pdf','local-documents','order-documents','pdf-preview','document-flow'];
 const integrity=Object.fromEntries(docFiles.map(n=>['/auto-src/'+n+'.js','sha384-'+crypto.createHash('sha384').update(fs.readFileSync(path.join(root,'auto-src',n+'.js'))).digest('base64')]));
 fs.writeFileSync(path.join(root,'assets/document-manifest.js'),'window.TEDocumentIntegrity='+JSON.stringify(integrity)+';\n');
 // Extract existing site logic without changing global handlers used by markup.
 for(const rel of ['goods/index.html','china-import/index.html','turkey-import/index.html','uae-import/index.html','israel-import/index.html','customs-clearance/index.html']){
  let html=fs.readFileSync(path.join(source,rel),'utf8');
  html=html.replace(/\s*<!-- Yandex\.Metrika counter -->[\s\S]*?<!-- \/Yandex\.Metrika counter -->/g,'');
  let cursor=0,result='',index=0;
  const regex=/<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  for(const match of html.matchAll(regex)){
   result+=html.slice(cursor,match.index);cursor=match.index+match[0].length;
   if(/src=|application\/ld\+json/i.test(match[1])||!match[2].trim()){result+=match[0];continue;}
   const filename=rel.split('/')[0]+'-'+(++index)+'.js';
   const dest=path.join(root,'assets','scripts',filename);fs.mkdirSync(path.dirname(dest),{recursive:true});
   fs.writeFileSync(dest,await protect(match[2],filename));
   result+='<script src="/assets/scripts/'+filename+'?v=20261012-4"></script>';
  }
  result+=html.slice(cursor);
  result=result.replace('</head>','<meta name="referrer" content="no-referrer">\n</head>');
  fs.writeFileSync(path.join(root,rel),result);
 }
 // Sensitive-data page retains strict no-eval CSP. Add immutable integrity checks for external JS.
 for(const rel of ['cars/index.html','equipment/index.html','documents/balance/index.html']){
  let page=fs.readFileSync(path.join(source,rel),'utf8');
  page=page.replace(/<script\b([^>]*?)src="([^"?]+)([^\"]*)"[^>]*><\/script>/g,(_,attrs,url,query)=>{
    const bytes=fs.readFileSync(path.join(root,url));const sri=crypto.createHash('sha384').update(bytes).digest('base64');query='?v='+crypto.createHash('sha256').update(bytes).digest('hex').slice(0,16);
    return `<script ${attrs.includes('defer')?'defer ':''}src="${url}${query}" integrity="sha384-${sri}" crossorigin="anonymous"></script>`;
  });
  page=page.replace(/(<link\b[^>]*href=")([^"?]+\.css)([^"]*)/g,(_,prefix,url)=>{const hash=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,url))).digest('hex').slice(0,16);return prefix+url+'?v='+hash;});
  fs.writeFileSync(path.join(root,rel),page);
 }
 // This obsolete review HTML is not a public entry point.
 if(fs.existsSync(path.join(root,'auto-src/index.html')))fs.unlinkSync(path.join(root,'auto-src/index.html'));
 const files=own.map(n=>'auto-src/'+n+'.js');
 fs.writeFileSync(path.join(root,'production-build.json'),JSON.stringify({version:'20261023-7',sourceCommit:require('child_process').execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),tools:{'javascript-obfuscator':'5.9.0',terser:'5.51.2'},sourceMaps:false,eval:false,files:Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex')]))},null,2)+'\n');
 // Early HTTPS upgrade on the production host. Edge redirect/HSTS still require domain access.
 const httpsBytes=fs.readFileSync(path.join(root,'auto-src/https-only.js'));
 const httpsSri=crypto.createHash('sha384').update(httpsBytes).digest('base64');
 const upgrade=`<script src="/auto-src/https-only.js?v=20261012-5" integrity="sha384-${httpsSri}" crossorigin="anonymous"></script>`;
 for(const rel of ['index.html','cars/index.html','equipment/index.html','documents/balance/index.html','goods/index.html','china-import/index.html','turkey-import/index.html','uae-import/index.html','israel-import/index.html','customs-clearance/index.html']){
  const file=path.join(root,rel);let html=fs.readFileSync(file,'utf8');
  html=html.replace(/<script src="\/auto-src\/https-only\.js[^>]*><\/script>/g,'');
  html=html.replace(/<meta charset="utf-8"\s*\/?\s*>/i,match=>match+upgrade).replaceAll('20261012-4','20261012-5');
  fs.writeFileSync(file,html);
 }
 console.log('Built obfuscated application and goods scripts; removed session recording; added script integrity checks.');
})().catch(e=>{console.error(e);process.exit(1)});
