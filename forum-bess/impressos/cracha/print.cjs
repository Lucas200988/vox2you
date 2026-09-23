const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const files=process.argv.slice(2);
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
for(const f of files){
  const p=await b.newPage({viewport:{width:400,height:600},deviceScaleFactor:4});
  await p.goto('file://'+process.cwd()+'/'+f,{waitUntil:'load'});await p.waitForTimeout(700);
  await p.emulateMedia({media:'screen'});
  await p.pdf({path:f.replace('.html','.pdf'),width:'100mm',height:'150mm',printBackground:true,margin:{top:0,right:0,bottom:0,left:0}});
  await (await p.$('#p1')).screenshot({path:f.replace('.html','-frente.png')});
  await (await p.$('#p2')).screenshot({path:f.replace('.html','-verso.png')});
  await p.close(); console.log('ok',f);
}
await b.close();})();
