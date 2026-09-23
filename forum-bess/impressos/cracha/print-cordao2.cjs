const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
// 1) PNG 300 dpi da fita inteira (900 mm = 10630 px)
let p=await b.newPage({viewport:{width:3402,height:76},deviceScaleFactor:3.125});
await p.goto('file://'+process.cwd()+'/cordao.html',{waitUntil:'load'});await p.waitForTimeout(600);
await (await p.$('#s')).screenshot({path:'cordao-abee-300dpi.png'}); await p.close();
// 2) PDF A4 paisagem: fita dividida em 3 trechos de 300 mm, um embaixo do outro
p=await b.newPage({viewport:{width:1123,height:794}});
const html=`<html><head><meta charset="UTF-8"><style>
*{margin:0;padding:0;box-sizing:border-box}body{font-family:Montserrat,Arial,sans-serif;background:#fff}
.pg{width:297mm;height:210mm;padding:14mm 0 0 0;position:relative}
h1{font-size:6mm;font-weight:900;color:#082A43;padding:0 14mm}
p{font-size:3.2mm;color:#5A6B7B;padding:2mm 14mm 0;line-height:1.5}
.seg{position:relative;margin:9mm 0 0 0;width:297mm;height:20mm;overflow:hidden}
.seg iframe{position:absolute;top:0;border:0;width:900mm;height:20mm}
.lab{position:absolute;right:14mm;top:-4.5mm;font-size:2.6mm;font-weight:800;color:#8B99A6;letter-spacing:.5mm}
.foot{position:absolute;bottom:10mm;left:14mm;right:14mm;font-size:2.8mm;color:#8B99A6;border-top:.3mm solid #E1E8EE;padding-top:3mm}
</style></head><body><div class="pg">
<h1>Cordão ABEE-MT — arte aberta 20 × 900 mm</h1>
<p>Fita contínua de 900 mm dividida em 3 trechos de 300 mm apenas para visualização. Para produção, usar o arquivo
<b>cordao-abee-20x900mm.pdf</b> (vetor, tamanho real) ou <b>cordao-abee-300dpi.png</b> (10.630 × 236 px). Padrão repetitivo — pode ser emendado em qualquer ponto.</p>
<div class="seg" style="margin-top:12mm"><span class="lab">0 – 300 mm</span><iframe src="cordao.html" style="left:0"></iframe></div>
<div class="seg"><span class="lab">300 – 600 mm</span><iframe src="cordao.html" style="left:-297mm"></iframe></div>
<div class="seg"><span class="lab">600 – 900 mm</span><iframe src="cordao.html" style="left:-594mm"></iframe></div>
<div class="foot">Sublimação em poliéster 20 mm · fundo #082A43 · verde #00B84E / #00D060 · amarelo #FFC107 · Reaproveitável em todos os eventos da ABEE-MT</div>
</div></body></html>`;
require('fs').writeFileSync('cordao-folha.html',html);
await p.goto('file://'+process.cwd()+'/cordao-folha.html',{waitUntil:'load'});await p.waitForTimeout(1200);
await p.emulateMedia({media:'screen'});
await p.pdf({path:'cordao-abee-folha-A4.pdf',width:'297mm',height:'210mm',printBackground:true,margin:{top:0,right:0,bottom:0,left:0}});
await p.screenshot({path:'cordao-folha-preview.png'});
console.log('ok'); await b.close();})();
