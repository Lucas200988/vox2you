# -*- coding: utf-8 -*-
"""Credenciais nominais da diretoria.
Uso:  python3 gerar-credenciais.py diretoria.csv [gestao]
CSV com cabecalho:  nome,cargo        ex.:  Eng.º Fulano de Tal,Presidente
Saida: nominais/credenciais-diretoria.pdf (frente+verso por pessoa)
"""
import io,csv,sys,os,subprocess,html
gestao=sys.argv[2] if len(sys.argv)>2 else '2025–2027'
base=io.open('credencial-diretoria.base.html',encoding='utf-8').read().replace('__GESTAO__',gestao)
rows=list(csv.DictReader(io.open(sys.argv[1],encoding='utf-8')))
os.makedirs('nominais',exist_ok=True)
head=base[:base.index('<!-- ===================== FRENTE')]
body=base[base.index('<!-- ===================== FRENTE'):base.rindex('</body>')]
pages=''.join(body.replace('__NOME__',html.escape(r['nome'].strip())).replace('__CARGO__',html.escape(r['cargo'].strip())).replace('id="p1"','').replace('id="p2"','') for r in rows)
io.open('nominais/_dir.html','w',encoding='utf-8').write(head+pages+'</body></html>')
js=("const{chromium}=require('/opt/node22/lib/node_modules/playwright');(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});"
    "const p=await b.newPage();await p.goto('file://'+process.cwd()+'/nominais/_dir.html',{waitUntil:'load'});await p.waitForTimeout(800);await p.emulateMedia({media:'screen'});"
    "await p.pdf({path:'nominais/credenciais-diretoria.pdf',width:'100mm',height:'150mm',printBackground:true,margin:{top:0,right:0,bottom:0,left:0}});await b.close();})();")
io.open('nominais/_run.cjs','w').write(js); subprocess.run(['node','nominais/_run.cjs'],check=True)
print('ok: %d credencial(is) -> nominais/credenciais-diretoria.pdf' % len(rows))
