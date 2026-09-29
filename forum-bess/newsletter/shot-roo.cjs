const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const p=await b.newPage({viewport:{width:680,height:900},deviceScaleFactor:2});
await p.goto('file://'+process.cwd()+'/roo-amanha.html',{waitUntil:'load'});await p.waitForTimeout(800);
await p.screenshot({path:'/tmp/claude-0/roo-email.png',fullPage:true}); console.log('ok'); await b.close();})();
