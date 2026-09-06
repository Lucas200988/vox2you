const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs=require('fs');
(async () => {
  const FPS=30, DUR=12.0, N=Math.round(FPS*DUR);
  fs.mkdirSync('frames',{recursive:true});
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await b.newPage({ viewport:{width:1080,height:1080}, deviceScaleFactor:1 });
  await p.goto('file://'+process.cwd()+'/anim.html',{waitUntil:'load'});
  await p.waitForTimeout(500);
  await p.evaluate(()=>document.getAnimations().forEach(a=>a.pause()));
  for(let i=0;i<N;i++){
    const t=i/FPS*1000;
    await p.evaluate(t=>document.getAnimations().forEach(a=>{a.currentTime=t;}),t);
    await p.screenshot({path:`frames/f${String(i).padStart(4,'0')}.png`});
  }
  console.log('frames:',N); await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
