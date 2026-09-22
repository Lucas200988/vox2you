const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const p=await b.newPage({viewport:{width:1120,height:1980},deviceScaleFactor:2});
await p.goto('file://'+process.cwd()+'/fogo-story.html',{waitUntil:'load'});await p.waitForTimeout(800);
const el=await p.$('#a'); await el.screenshot({path:'fogo-story.png'}); console.log('ok'); await b.close();})();
