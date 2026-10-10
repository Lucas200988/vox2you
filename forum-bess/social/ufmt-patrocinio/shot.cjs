const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const p=await b.newPage({viewport:{width:1120,height:1420},deviceScaleFactor:2});
await p.goto('file://'+process.cwd()+'/cartaz.html',{waitUntil:'load'});await p.waitForTimeout(600);
await (await p.$('#a')).screenshot({path:'cartaz-ufmt.png'}); console.log('ok'); await b.close();})();
