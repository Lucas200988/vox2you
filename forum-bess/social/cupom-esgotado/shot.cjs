const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
for(const [f,h,out] of [['esgotado.html',1420,'esgotado.png'],['esgotado-story.html',1980,'esgotado-story.png']]){
 const p=await b.newPage({viewport:{width:1120,height:h},deviceScaleFactor:2});
 await p.goto('file://'+process.cwd()+'/'+f,{waitUntil:'load'});await p.waitForTimeout(700);
 await (await p.$('#a')).screenshot({path:out}); await p.close();}
console.log('ok'); await b.close();})();
