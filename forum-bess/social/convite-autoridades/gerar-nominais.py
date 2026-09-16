# -*- coding: utf-8 -*-
"""Gera um convite nominal por autoridade.
Uso:  python3 gerar-nominais.py nomes.txt
      (um nome por linha, ex.:  Eng.º Fulano de Tal — Presidente do CREA-MT)
Saida: nominais/convite-<slug>.png
"""
import io,sys,os,re,subprocess,unicodedata
base=io.open('convite.html',encoding='utf-8').read()
nomes=[l.strip() for l in io.open(sys.argv[1],encoding='utf-8') if l.strip()]
os.makedirs('nominais',exist_ok=True)
def slug(t):
    t=unicodedata.normalize('NFKD',t).encode('ascii','ignore').decode()
    return re.sub(r'[^a-zA-Z0-9]+','-',t).strip('-').lower()[:50]
BLOCO=('<div style="margin-top:24px;font-family:Montserrat,sans-serif">'
 '<div style="font-size:13px;font-weight:900;letter-spacing:5px;text-transform:uppercase;color:#D8B25A">Convite nominal</div>'
 '<div style="margin-top:8px;font-size:30px;font-weight:900;color:#F2DFA8;line-height:1.25">%s</div>'
 '<div style="width:220px;height:1px;background:rgba(216,178,90,.5);margin:14px auto 0"></div></div>')
for n in nomes:
    html=base.replace('<div class="ev">', BLOCO % n + '\n    <div class="ev">',1)
    io.open('_tmp.html','w',encoding='utf-8').write(html)
    js=("const{chromium}=require('/opt/node22/lib/node_modules/playwright');(async()=>{"
        "const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});"
        "const p=await b.newPage({viewport:{width:1080,height:1700},deviceScaleFactor:2});"
        "await p.goto('file://'+process.cwd()+'/_tmp.html',{waitUntil:'load'});await p.waitForTimeout(600);"
        "const e=await p.$('#a');await e.screenshot({path:'nominais/convite-%s.png'});await b.close();})();" % slug(n))
    io.open('_tmp.cjs','w',encoding='utf-8').write(js)
    subprocess.run(['node','_tmp.cjs'],check=True)
    print('ok:',n)
os.remove('_tmp.html'); os.remove('_tmp.cjs')
