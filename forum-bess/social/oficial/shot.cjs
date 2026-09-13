const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const p=await b.newPage({viewport:{width:1080,height:1200},deviceScaleFactor:2});
await p.goto('file://'+process.cwd()+'/carrossel.html',{waitUntil:'load'}); await p.waitForTimeout(600);
for(const id of ['s1','s2','s3','s4']){const el=await p.$('#'+id); await el.screenshot({path:`oficial-${id}.png`});}
console.log('ok'); await b.close();})().catch(e=>{console.error(e);process.exit(1)});
