const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const p=await b.newPage({viewport:{width:1080,height:1200},deviceScaleFactor:2});
await p.goto('file://'+process.cwd()+'/carrossel.html',{waitUntil:'load'}); await p.waitForTimeout(600);
const ids=['s1','s2','s3a','s3b','s4']; for(let i=0;i<ids.length;i++){const el=await p.$('#'+ids[i]); await el.screenshot({path:`oficial-s${i+1}.png`});}
console.log('ok'); await b.close();})().catch(e=>{console.error(e);process.exit(1)});
