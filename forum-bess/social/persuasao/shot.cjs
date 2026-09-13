const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const p=await b.newPage({viewport:{width:1080,height:1200},deviceScaleFactor:2});
await p.goto('file://'+process.cwd()+'/artes.html',{waitUntil:'load'}); await p.waitForTimeout(600);
for(const id of ['a1','a2','a3']){const el=await p.$('#'+id); await el.screenshot({path:`arte-${id}.png`});}
console.log('ok'); await b.close();})().catch(e=>{console.error(e);process.exit(1)});
