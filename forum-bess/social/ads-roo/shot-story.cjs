const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const p=await b.newPage({viewport:{width:1120,height:1980},deviceScaleFactor:2});
await p.goto('file://'+process.cwd()+'/ad-roo-story.html',{waitUntil:'load'});await p.waitForTimeout(700);
const el=await p.$('#a'); await el.screenshot({path:'ad-roo-story.png'}); console.log('ok'); await b.close();})();
