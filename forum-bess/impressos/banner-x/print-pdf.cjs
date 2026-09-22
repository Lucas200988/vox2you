const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const p=await b.newPage({viewport:{width:800,height:1200}});
await p.goto('file://'+process.cwd()+'/banner-x.html',{waitUntil:'load'});await p.waitForTimeout(900);
await p.emulateMedia({media:'screen'});
// 1 cm = 37.7953 px  ->  80 cm = 3023.6 px ; conteudo tem 800 px  ->  escala 3.7795
await p.addStyleTag({content:'html,body{margin:0;padding:0;background:#082A43}.bn{zoom:3.77953}'});
await p.pdf({path:'banner-x-80x120cm.pdf',width:'80cm',height:'120cm',printBackground:true,margin:{top:0,right:0,bottom:0,left:0},pageRanges:'1'});
console.log('pdf ok'); await b.close();})();
