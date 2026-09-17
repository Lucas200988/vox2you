const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const p=await b.newPage({viewport:{width:1080,height:1500},deviceScaleFactor:2});
await p.goto('file://'+process.cwd()+'/post-mutua.html',{waitUntil:'load'});await p.waitForTimeout(800);
const el=await p.$('#a'); await el.screenshot({path:'post-mutua.png'}); console.log('ok'); await b.close();})();
