const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs=require('fs');
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const files=fs.readdirSync('.').filter(f=>/^[cs]-.*\.html$/.test(f));
for(const f of files){const story=f.startsWith('s-');
 const p=await b.newPage({viewport:{width:1120,height:story?1980:1420},deviceScaleFactor:2});
 await p.goto('file://'+process.cwd()+'/'+f,{waitUntil:'load'});await p.waitForTimeout(500);
 await (await p.$('#a')).screenshot({path:f.replace('.html','.png')}); await p.close();}
console.log('ok',files.length); await b.close();})();
