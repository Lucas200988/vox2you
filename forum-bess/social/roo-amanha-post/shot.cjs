const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
for(const [f,h,o] of [['post.html',1420,'roo-amanha.png'],['post-story.html',1980,'roo-amanha-story.png']]){
 const p=await b.newPage({viewport:{width:1120,height:h},deviceScaleFactor:2});
 await p.goto('file://'+process.cwd()+'/'+f,{waitUntil:'load'});await p.waitForTimeout(600);
 await (await p.$('#a')).screenshot({path:o}); await p.close();}
console.log('ok'); await b.close();})();
