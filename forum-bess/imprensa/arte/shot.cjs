const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const p=await b.newPage({viewport:{width:1120,height:1160},deviceScaleFactor:2});
await p.goto('file://'+process.cwd()+'/noticia-feed.html',{waitUntil:'load'});await p.waitForTimeout(700);
const el=await p.$('#feed'); await el.screenshot({path:'noticia-feed.png'}); console.log('ok'); await b.close();})();
