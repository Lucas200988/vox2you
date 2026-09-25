const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
for(const f of ['placa-crea-mt','placa-mutua']){
 const p=await b.newPage({viewport:{width:900,height:660},deviceScaleFactor:2});
 const svg=require('fs').readFileSync(f+'.svg','utf8');
 await p.setContent(`<html><body style="margin:0;background:#1a1a1a;display:flex;align-items:center;justify-content:center;height:660px"><div style="width:760px">${svg.replace('width="180mm" height="130mm"','width="100%" height="auto" style="overflow:visible"')}</div></body></html>`);
 await p.waitForTimeout(400); await p.screenshot({path:f+'-preview.png'}); await p.close();}
console.log('ok'); await b.close();})();
