const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
for(const [dsf,out] of [[1,'banner-970x150.png'],[2,'banner-970x150@2x.png']]){
  const p=await b.newPage({viewport:{width:1000,height:200},deviceScaleFactor:dsf});
  await p.goto('file://'+process.cwd()+'/banner-970x150.html',{waitUntil:'load'});await p.waitForTimeout(600);
  const el=await p.$('#a'); await el.screenshot({path:out}); await p.close();
}
console.log('ok'); await b.close();})();
