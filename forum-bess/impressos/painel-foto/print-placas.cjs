const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const p=await b.newPage({viewport:{width:794,height:560}});
await p.goto('file://'+process.cwd()+'/placas.html',{waitUntil:'load'});await p.waitForTimeout(900);
await p.emulateMedia({media:'screen'});
await p.pdf({path:'placas-foto-A5.pdf',width:'210mm',height:'148mm',printBackground:true,margin:{top:0,right:0,bottom:0,left:0}});
// contato de 8 placas para preview
const pages=await p.$$('.pg'); const shots=[];
for(let i=0;i<Math.min(8,pages.length);i++){shots.push(await pages[i].screenshot({type:'png'}));}
require('fs').writeFileSync('_shots.json',JSON.stringify(shots.map(s=>s.toString('base64'))));
console.log('ok',pages.length); await b.close();})();
