const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
// preview
let p=await b.newPage({viewport:{width:800,height:1200},deviceScaleFactor:2});
await p.goto('file://'+process.cwd()+'/banner-x.html',{waitUntil:'load'});await p.waitForTimeout(800);
await (await p.$('#a')).screenshot({path:'preview.png'}); await p.close();
// PNG 150 dpi (6 px/mm -> 4800 x 7200)
p=await b.newPage({viewport:{width:800,height:1200},deviceScaleFactor:6});
await p.goto('file://'+process.cwd()+'/banner-x.html',{waitUntil:'load'});await p.waitForTimeout(1200);
await (await p.$('#a')).screenshot({path:'banner-x-80x120cm-150dpi.png'}); await p.close();
// PDF vetorial em tamanho real
p=await b.newPage({viewport:{width:800,height:1200}});
await p.goto('file://'+process.cwd()+'/banner-x.html',{waitUntil:'load'});await p.waitForTimeout(800);
await p.emulateMedia({media:'screen'});
await p.addStyleTag({content:'html,body{margin:0;padding:0;background:#082A43}.bn{zoom:3.77953}'});
await p.pdf({path:'banner-x-80x120cm.pdf',width:'80cm',height:'120cm',printBackground:true,margin:{top:0,right:0,bottom:0,left:0},pageRanges:'1'});
console.log('ok'); await b.close();})();
