const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const p=await b.newPage({viewport:{width:3500,height:120},deviceScaleFactor:4});
await p.goto('file://'+process.cwd()+'/cordao.html',{waitUntil:'load'});await p.waitForTimeout(700);
await p.emulateMedia({media:'screen'});
await p.pdf({path:'cordao-abee-20x900mm.pdf',width:'900mm',height:'20mm',printBackground:true,margin:{top:0,right:0,bottom:0,left:0}});
// preview de um trecho (primeiros 300 mm)
const el=await p.$('#s'); await el.screenshot({path:'cordao-preview.png',clip:{x:0,y:0,width:1134,height:76}});
console.log('ok'); await b.close();})();
