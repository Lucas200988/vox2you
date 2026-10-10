const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const jobs=[
 ['associe-se-a3.html','associe-se-A3.pdf','297mm','420mm',1527],
 ['associe-se-banner.html','associe-se-banner-80x120cm.pdf','80cm','120cm',1620],
 ['quem-faz-a3.html','quem-faz-acontecer-A3.pdf','297mm','420mm',1527],
 ['quem-faz-banner.html','quem-faz-acontecer-banner-80x120cm.pdf','80cm','120cm',1620],
];
for(const [f,out,w,h,px] of jobs){
  const p=await b.newPage({viewport:{width:1080,height:px}});
  await p.goto('file://'+process.cwd()+'/'+f,{waitUntil:'load'});await p.waitForTimeout(600);
  await p.emulateMedia({media:'screen'});
  // escala o conteudo (1080px de largura) para a largura fisica da pagina
  const wmm=parseFloat(w)*(w.endsWith('cm')?10:1); const zoom=(wmm*3.77953)/1080;
  await p.addStyleTag({content:`html,body{margin:0;padding:0;background:#071423}.art{zoom:${zoom}}`});
  await p.pdf({path:out,width:w,height:h,printBackground:true,margin:{top:0,right:0,bottom:0,left:0},pageRanges:'1'});
  await (await p.$('#a')).screenshot({path:out.replace('.pdf','-preview.png')});
  await p.close(); console.log('ok',out);
}
await b.close();})();
