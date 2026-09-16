const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const p=await b.newPage({viewport:{width:1080,height:1680},deviceScaleFactor:2});
await p.goto('file://'+process.cwd()+'/cronograma.html',{waitUntil:'load'}); await p.waitForTimeout(700);
const el=await p.$('#a'); await el.screenshot({path:'cronograma.png'}); console.log('ok'); await b.close();})();
