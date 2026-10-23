import {build} from 'esbuild';
import fs from 'node:fs';
await build({entryPoints:[new URL('dashboard-worker.mjs',import.meta.url).pathname],outfile:new URL('dist/dashboard.mjs',import.meta.url).pathname,bundle:true,minify:true,format:'esm',platform:'browser',target:'es2022',plugins:[{name:'dashboard-assets',setup(b){b.onLoad({filter:/dashboard\/(index\.html|login\.html|style\.css|app\.js|login\.js)$/},async args=>({contents:await fs.promises.readFile(args.path,'utf8'),loader:'text'}));}}]});
console.log('Built protected statistics dashboard');
