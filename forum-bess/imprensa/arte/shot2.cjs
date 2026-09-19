const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const p=await b.newPage({viewport:{width:1250,height:700},deviceScaleFactor:2});
await p.goto('file://'+process.cwd()+'/noticia-1200x630.html',{waitUntil:'load'});await p.waitForTimeout(700);
const el=await p.$('#feed'); await el.screenshot({path:'noticia-1200x630.png'}); console.log('ok'); await b.close();})();
