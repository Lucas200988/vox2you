const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
// preview rapido (2x)
let p=await b.newPage({viewport:{width:800,height:1200},deviceScaleFactor:2});
await p.goto('file://'+process.cwd()+'/banner-x.html',{waitUntil:'load'});await p.waitForTimeout(800);
let el=await p.$('#a'); await el.screenshot({path:'preview.png'}); await p.close();
console.log('preview ok'); await b.close();})();
