const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
let p=await b.newPage({viewport:{width:1120,height:1420},deviceScaleFactor:2});
await p.goto('file://'+process.cwd()+'/misto-post.html',{waitUntil:'load'});await p.waitForTimeout(600);
await (await p.$('#a')).screenshot({path:'cartaz-misto.png'}); await p.close();
for(const [f,out,w,h,px] of [['misto-a3.html','cartaz-misto-A3.pdf','297mm','420mm',1527],['misto-banner.html','cartaz-misto-banner-80x120cm.pdf','80cm','120cm',1620]]){
  p=await b.newPage({viewport:{width:1080,height:px}});
  await p.goto('file://'+process.cwd()+'/'+f,{waitUntil:'load'});await p.waitForTimeout(600); await p.emulateMedia({media:'screen'});
  const wmm=parseFloat(w)*(w.endsWith('cm')?10:1); const zoom=(wmm*3.77953)/1080;
  await p.addStyleTag({content:`html,body{margin:0;padding:0;background:#071423}.art{zoom:${zoom}}`});
  await p.pdf({path:out,width:w,height:h,printBackground:true,margin:{top:0,right:0,bottom:0,left:0},pageRanges:'1'}); await p.close();
}
console.log('ok'); await b.close();})();
