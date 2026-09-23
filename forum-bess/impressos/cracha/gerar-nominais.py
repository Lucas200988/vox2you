# -*- coding: utf-8 -*-
"""Gera crachas nominais a partir de uma lista.
Uso:  python3 gerar-nominais.py lista.csv
CSV com cabecalho:  nome,empresa,tipo     (tipo = participante | staff)
Saida: nominais/crachas-participantes.pdf e nominais/crachas-staff.pdf (frente+verso por pessoa)
"""
import io,csv,sys,os,subprocess,html
base=io.open('cracha.base.html',encoding='utf-8').read()
rows=list(csv.DictReader(io.open(sys.argv[1],encoding='utf-8')))
os.makedirs('nominais',exist_ok=True)
head=base[:base.index('<!-- ===================== FRENTE')]
body=base[base.index('<!-- ===================== FRENTE'):base.rindex('</body>')]
def page(r):
    staff=(r.get('tipo','').strip().lower()=='staff')
    b=body.replace('__TOPCLS__','staff' if staff else '').replace('__ROLECLS__','staff' if staff else '')
    b=b.replace('__ROLE__','Organização' if staff else 'Participante')
    b=b.replace('__NOME__',html.escape(r['nome'].strip())).replace('__LBL2__','Função' if staff else 'Empresa / Instituição')
    b=b.replace('__EMPRESA__',html.escape(r.get('empresa','').strip()))
    return b.replace('id="p1"','').replace('id="p2"','')
for tipo in ['participante','staff']:
    sel=[r for r in rows if (r.get('tipo','participante').strip().lower() or 'participante')==tipo]
    if not sel: continue
    doc=head+''.join(page(r) for r in sel)+'</body></html>'
    io.open('nominais/_%s.html'%tipo,'w',encoding='utf-8').write(doc)
    js=("const{chromium}=require('/opt/node22/lib/node_modules/playwright');(async()=>{"
        "const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});"
        "const p=await b.newPage();await p.goto('file://'+process.cwd()+'/nominais/_%s.html',{waitUntil:'load'});"
        "await p.waitForTimeout(800);await p.emulateMedia({media:'screen'});"
        "await p.pdf({path:'nominais/crachas-%s.pdf',width:'100mm',height:'150mm',printBackground:true,margin:{top:0,right:0,bottom:0,left:0}});"
        "await b.close();})();" % (tipo,tipo))
    io.open('nominais/_run.cjs','w').write(js); subprocess.run(['node','nominais/_run.cjs'],check=True)
    print('ok: %d cracha(s) de %s -> nominais/crachas-%s.pdf' % (len(sel),tipo,tipo))
