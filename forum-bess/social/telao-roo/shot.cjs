const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const p=await b.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
await p.goto('file://'+process.cwd()+'/telao.html',{waitUntil:'load'});await p.waitForTimeout(900);
const els=await p.$$('.sl'); let i=1;
for(const el of els){await el.screenshot({path:`telao-roo-${String(i).padStart(2,'0')}.png`}); i++;}
console.log('ok',els.length); await b.close();})();
