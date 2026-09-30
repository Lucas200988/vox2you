const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const p=await b.newPage({viewport:{width:1920,height:1080}});
await p.goto('file://'+process.cwd()+'/telao.html',{waitUntil:'load'});await p.waitForTimeout(900);
await p.emulateMedia({media:'screen'});
await p.addStyleTag({content:'.sl{page-break-after:always}.sl:last-child{page-break-after:auto}body{background:#082A43}'});
await p.pdf({path:'telao-roo-slides.pdf',width:'1920px',height:'1080px',printBackground:true,margin:{top:0,right:0,bottom:0,left:0}});
console.log('pdf ok'); await b.close();})();
