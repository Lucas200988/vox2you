# -*- coding: utf-8 -*-
"""Cronograma de Rondonopolis. Edite a lista GRADE abaixo e rode: python3 gerar.py"""
import io,re,base64
L=lambda k: io.open('/tmp/claude-0/lg/%s.txt'%k).read().strip()
LOGOS={'weg':'weg','dcco':'dcco','condutive':'condutive','sungrow':'sungrow','belenergy':'belenergy','e4uatro':'e4uatro',
       'solvaz':'solvaz-engenharia-e-consultoria','miese':'miese-energia-solar','standart':'standart-engenharia-el-trica','vogel':'vogel-engenharia-e-consultoria',
       'sonare':'sonare-engenharia','caberlin':'caberlin-engenharia','ruah':'ruah-engenharia','gdpro':'gd-pro','canadian':'canadian-solar','ccr':'ccr','mutua':'m-tua'}

# ---- GRADE (hora_inicio, hora_fim, logo|emoji, titulo, descricao, destaque)
#      logo: chave de LOGOS para logo real; ou um emoji; ou '' para nada
GRADE=[
 ('18h30','19h15','👥','Credenciamento e networking','Recepção dos participantes e início da integração',''),
 ('19h15','19h25','🎁','Sorteio especial — Presença Premiada','Sorteio apenas para quem estiver presente no salão','hl'),
 ('19h25','19h45','🎙️','Abertura Institucional · 20 min','ABEE-MT + CREA-MT + Mútua-MT',''),
 ('19h45','20h45','condutive','Condutive · 60 min · Palestra de encerramento','Soluções e tecnologias para o setor de energia · armazenamento (BESS) e o novo mercado','fin'),
 ('20h45','21h00','🏁','Encerramento Oficial · 15 min','Agradecimentos e considerações finais',''),
 ('21h00','21h30','🥂','Confraternização + Networking','Comes e bebes · continuidade do encontro em formato livre','hl'),
]

rows=''
for ini,fim,mid,ttl,dsc,cls in GRADE:
    if mid in LOGOS: m='<img src="%s" alt=""/>'%L(LOGOS[mid])
    elif mid: m='<span class="em">%s</span>'%mid
    else: m='<span class="wm">?</span>'
    ttl=re.sub(r'· Palestra de encerramento',r'<em>· Palestra de encerramento</em>',ttl)
    rows+=f'<div class="row {cls}"><div class="hr">{ini} – {fim}</div><div class="mid">{m}</div><div><div class="ttl">{ttl}</div><div class="dsc">{dsc}</div></div></div>\n'

band=''.join('<img class="%s" src="%s"/>'%(c,L(LOGOS[k])) for k,c in [('weg',''),('sungrow',''),('dcco',''),('belenergy',''),('e4uatro','t'),('solvaz','t'),('miese','t'),('standart',''),('vogel',''),('sonare','t'),('caberlin','t'),('ruah','t'),('gdpro','t'),('condutive','t'),('canadian','')])
band+='<span class="dk"><img src="%s"/></span><img class="t" src="%s"/>'%(L('ccr'),L('m-tua'))

html=f'''<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/><style>
*{{margin:0;padding:0;box-sizing:border-box}}
:root{{--n:#082A43;--g:#00B84E;--gl:#00D060;--gt:#00994A;--line:#DCE4EA;--mut:#5A6B7B}}
body{{background:#000;font-family:Montserrat,'Segoe UI',Arial,sans-serif}}
.art{{width:1080px;height:1240px;position:relative;overflow:hidden;background:#F2F5F8;display:flex;flex-direction:column}}
.hd{{background:linear-gradient(135deg,#0A3252,#082A43 55%,#05192A);padding:30px 40px 26px;position:relative;overflow:hidden}}
.hd::after{{content:'';position:absolute;right:-60px;top:-70px;width:320px;height:320px;border-radius:50%;background:radial-gradient(circle,rgba(255,179,0,.22),transparent 70%)}}
.hd .top{{position:relative;z-index:2;display:flex;align-items:center;gap:18px}}
.bolt{{font-size:54px;line-height:1}}
.brand .t1{{font-size:46px;font-weight:900;color:#fff;letter-spacing:-1px;line-height:.92}}
.brand .t2{{font-size:32px;font-weight:900;color:var(--gl);letter-spacing:4px;line-height:1}}
.vline{{width:2px;height:74px;background:rgba(255,255,255,.22)}}
.full{{font-size:14px;white-space:nowrap;font-weight:700;color:rgba(255,255,255,.82);line-height:1.45;text-transform:uppercase;letter-spacing:.6px}}
.when{{margin-left:auto;display:flex;flex-direction:column;gap:10px}}
.when div{{display:flex;align-items:center;gap:10px;color:#fff}}
.when .ic{{width:34px;height:34px;border-radius:9px;background:rgba(255,179,0,.18);border:1px solid rgba(255,179,0,.45);display:flex;align-items:center;justify-content:center;font-size:17px}}
.when b{{font-size:18px;white-space:nowrap;font-weight:900;letter-spacing:.5px}}
.when span{{display:block;font-size:12px;white-space:nowrap;font-weight:700;color:rgba(255,255,255,.65);letter-spacing:1px}}
.tbl{{flex:1;padding:0 26px;margin-top:-2px}}
.thead{{display:grid;grid-template-columns:190px 132px 1fr;background:#0E3A5C;color:#fff;font-size:15px;font-weight:900;letter-spacing:2px;text-transform:uppercase;padding:13px 18px;border-radius:10px 10px 0 0}}
.row{{display:grid;grid-template-columns:190px 132px 1fr;align-items:center;background:#fff;border-bottom:1px solid var(--line);padding:26px 18px}}
.row:nth-child(even){{background:#EAF1F6}}
.row.hl{{background:linear-gradient(90deg,rgba(0,184,78,.12),rgba(0,184,78,.04))}}
.row.fin{{background:linear-gradient(90deg,rgba(255,179,0,.16),rgba(255,179,0,.04))}}
.row.fin .ttl em{{font-style:normal;color:#B07A00;font-weight:800;font-size:17px}}
.row:last-child{{border-radius:0 0 10px 10px;border-bottom:none}}
.hr{{font-size:22px;font-weight:900;color:var(--n)}}
.mid{{display:flex;align-items:center;justify-content:center;padding:0 16px}}
.mid img{{max-height:48px;max-width:118px;object-fit:contain;display:block}}
.mid .em{{font-size:30px}}
.mid .wm{{width:44px;height:44px;border-radius:50%;border:2px dashed #B8C4CE;color:#B8C4CE;font-size:22px;font-weight:900;display:flex;align-items:center;justify-content:center}}
.ttl{{font-size:22px;font-weight:900;color:var(--n);line-height:1.2}}
.dsc{{font-size:16px;color:var(--mut);font-weight:600;line-height:1.35;margin-top:3px}}
.pil{{margin-top:14px;margin-bottom:10px;background:#0E3A5C;color:#fff;display:flex;justify-content:space-around;padding:13px 20px;border-radius:10px}}
.pil span{{font-size:14px;font-weight:800;letter-spacing:3px;text-transform:uppercase;color:rgba(255,255,255,.9)}}
.pband{{margin-top:12px;padding:0 26px}}
.pband .pl{{font-size:11px;font-weight:900;letter-spacing:4px;text-transform:uppercase;color:#7C8B99;text-align:center;margin-bottom:9px}}
.pband .bd{{background:#fff;border:1px solid #E1E8EE;border-radius:12px;padding:11px 14px;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:10px 18px}}
.pband .bd img{{height:26px;max-width:110px;width:auto;object-fit:contain;display:block}}
.pband .bd img.t{{height:36px}}
.pband .bd .dk{{background:#0b1a2e;border-radius:6px;padding:4px 8px;display:flex}}.pband .bd .dk img{{height:22px}}
.slog{{background:linear-gradient(90deg,var(--g),var(--gl));color:#04301A;text-align:center;font-size:20px;font-weight:900;letter-spacing:2px;text-transform:uppercase;padding:12px;margin:10px 26px 0;border-radius:10px}}
.ft{{background:#fff;border-top:3px solid var(--g);padding:18px 40px;display:flex;align-items:center;justify-content:space-between;gap:24px;margin-top:14px}}
.blk{{text-align:center}}.blk .lb{{font-size:11px;font-weight:900;letter-spacing:4px;text-transform:uppercase;color:#8B99A6;margin-bottom:9px}}
.blk .r2{{display:flex;align-items:center;gap:14px;justify-content:center}}
.blk img{{height:52px;width:auto;object-fit:contain;display:block}}.selo{{height:88px!important}}
</style></head><body><div class="art" id="a">
<div class="hd"><div class="top"><div class="bolt">⚡</div><div class="brand"><div class="t1">FMEES</div><div class="t2">2026</div></div><div class="vline"></div>
<div class="full">Fórum Mato-Grossense<br>de Engenharia Elétrica<br>e Energias Sustentáveis</div>
<div class="when"><div><span class="ic">📅</span><div><b>30 DE SETEMBRO DE 2026</b></div></div><div><span class="ic">📍</span><div><b>RONDONÓPOLIS – MT</b><span>Espaço Gourmet Corpal · 18h30 às 21h30</span></div></div></div></div></div>
<div class="tbl"><div class="thead"><div>Horário</div><div></div><div>Atividade</div></div>
{rows}
<div class="pil"><span>⚙️ Engenharia</span><span>🌱 Tecnologia</span><span>⚡ Energia</span><span>🤝 Conexões</span></div></div>
<div class="pband"><div class="pl">Patrocinadores</div><div class="bd">{band}</div></div>
<div class="slog">O novo mercado da energia está começando</div>
<div class="ft"><div class="blk"><div class="lb">Realização</div><div class="r2"><img src="{L('abee-mt')}"/></div></div>
<div class="blk"><div class="lb">Apoio institucional</div><div class="r2"><img src="{L('crea-mt')}"/><img src="{L('m-tua')}"/></div></div>
<div class="blk"><div class="lb">Patrocínio</div><div class="r2"><img class="selo" src="{L('selo')}"/></div></div></div>
</div></body></html>'''
io.open('cronograma-roo.html','w',encoding='utf-8').write(html); print('ok', len(GRADE), 'blocos')
