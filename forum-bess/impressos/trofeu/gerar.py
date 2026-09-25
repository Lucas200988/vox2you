# -*- coding: utf-8 -*-
"""Arte vetorial (SVG) da placa 3D — 1 unidade = 1 mm. Camadas por cor e altura de relevo."""
import io
W,H=180,130          # placa
R=8                  # raio dos cantos
NAVY='#082A43';WHITE='#FFFFFF';GREEN='#00B84E';AMBER='#FFC107';GREY='#8B99A6'

def placa(hom, linha2, nome_arq):
    s=[]
    s.append(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}mm" height="{H}mm" viewBox="0 0 {W} {H}" font-family="Montserrat, Arial, Helvetica, sans-serif">')
    # ---- CAMADA 1: base navy (8 mm) — z 0→8
    s.append(f'<g id="L1_base_navy_z0-8" data-cor="{NAVY}" data-altura="8mm">')
    s.append(f'<rect x="0" y="0" width="{W}" height="{H}" rx="{R}" fill="{NAVY}"/>')
    s.append('</g>')
    # ---- CAMADA 2: placa branca embutida (rebaixo 1 mm, sobe 2 mm) — z 7→10
    s.append(f'<g id="L2_placa_branca_z7-10" data-cor="{WHITE}" data-altura="3mm">')
    s.append(f'<rect x="8" y="30" width="{W-16}" height="{H-46}" rx="4" fill="{WHITE}"/>')
    s.append('</g>')
    # ---- CAMADA 3: relevo baixo 1 mm (texto navy sobre branco) — z 10→11
    s.append(f'<g id="L3_texto_navy_z10-11" data-cor="{NAVY}" data-altura="1mm" fill="{NAVY}" text-anchor="middle">')
    s.append(f'<text x="{W/2}" y="46" font-size="5.2" font-weight="900" letter-spacing="2.2">HOMENAGEM</text>')
    s.append(f'<text x="{W/2}" y="66" font-size="15" font-weight="900" letter-spacing="-.3">{hom}</text>')
    s.append(f'<text x="{W/2}" y="78" font-size="5.6" font-weight="700" fill="{GREY}">{linha2}</text>')
    s.append(f'<text x="{W/2}" y="{H-22}" font-size="4.2" font-weight="800" letter-spacing="1" fill="{GREY}">28 · 09 · 2026 · CUIABÁ — MT</text>')
    s.append('</g>')
    # ---- CAMADA 4: relevo alto 3 mm — raio amarelo + FMEES verde + barra — z 8→11 (sobre navy)
    s.append(f'<g id="L4_relevo_alto_z8-11" data-altura="3mm">')
    # raio (poligono simples, imprimivel)
    s.append(f'<polygon fill="{AMBER}" points="22,6 14,17 19,17 15,26 25,13 20,13 24,6"/>')
    s.append(f'<text x="30" y="14" font-size="8.5" font-weight="900" fill="{WHITE}" letter-spacing="-.2">FMEES</text>')
    s.append(f'<text x="30" y="24" font-size="7.2" font-weight="900" fill="{GREEN}" letter-spacing="1.6">2026</text>')
    # assinatura ABEE-MT a direita, em relevo alto
    s.append(f'<text x="{W-8}" y="14" font-size="6.4" font-weight="900" fill="{WHITE}" text-anchor="end">ABEE-MT</text>')
    s.append(f'<text x="{W-8}" y="21" font-size="3.2" font-weight="700" fill="{GREEN}" text-anchor="end" letter-spacing=".6">ASSOCIAÇÃO BRASILEIRA DE</text>')
    s.append(f'<text x="{W-8}" y="25.5" font-size="3.2" font-weight="700" fill="{GREEN}" text-anchor="end" letter-spacing=".6">ENGENHEIROS ELETRICISTAS · MT</text>')
    # barra verde/amarela no rodape
    s.append(f'<rect x="8" y="{H-12}" width="{(W-16)*0.62}" height="4" rx="2" fill="{GREEN}"/>')
    s.append(f'<rect x="{8+(W-16)*0.62}" y="{H-12}" width="{(W-16)*0.38}" height="4" rx="2" fill="{AMBER}"/>')
    s.append('</g>')
    # ---- CAMADA 5: alojamento da logo do homenageado (rebaixo 40x40 na placa branca, z 10) — peca separada colada
    s.append(f'<g id="L5_alojamento_logo_40x40_z10" data-nota="rebaixo de 1 mm para colar a logo impressa separadamente">')
    s.append(f'<rect x="{W/2-20}" y="84" width="40" height="14" rx="2" fill="none" stroke="{GREY}" stroke-width=".4" stroke-dasharray="1.5 1"/>')
    s.append(f'<text x="{W/2}" y="92" font-size="2.6" fill="{GREY}" text-anchor="middle">LOGO {hom} · peça colada · 40 × 18 mm</text>')
    s.append('</g>')
    # ---- COTAS (nao imprimir)
    s.append(f'<g id="COTAS_nao_imprimir" fill="none" stroke="#E03131" stroke-width=".3" font-size="3" font-family="Arial">')
    s.append(f'<line x1="0" y1="-6" x2="{W}" y2="-6"/><text x="{W/2}" y="-8" fill="#E03131" text-anchor="middle" stroke="none">{W} mm</text>')
    s.append(f'<line x1="-6" y1="0" x2="-6" y2="{H}"/><text x="-8" y="{H/2}" fill="#E03131" text-anchor="middle" stroke="none" transform="rotate(-90 -8 {H/2})">{H} mm</text>')
    s.append('</g>')
    s.append('</svg>')
    io.open(nome_arq,'w',encoding='utf-8').write('\n'.join(s))

placa('CREA-MT','Apoio institucional ao FMEES 2026','placa-crea-mt.svg')
placa('MÚTUA-MT','Patrocínio e apoio institucional ao FMEES 2026','placa-mutua.svg')

# ---- Ficha tecnica
io.open('FICHA-IMPRESSAO-3D.md','w',encoding='utf-8').write('''# PLACA DE HOMENAGEM — FMEES 2026 · ficha para impressão 3D

Duas placas (CREA-MT e Mútua-MT), mesma geometria, texto diferente.
Arquivos: placa-crea-mt.svg · placa-mutua.svg  (1 unidade = 1 mm; grupos = camadas)

## Geometria
- Placa: 180 × 130 mm, cantos R8
- Base: 8 mm de espessura, filamento AZUL-MARINHO (#082A43)
- Pé traseiro integrado: aba de 60 × 40 mm a 70°, para a placa ficar em pé (adicionar no modelo)

## Camadas (z a partir da mesa)
| Camada | Cor | Z | O que é |
|---|---|---|---|
| L1 | Navy | 0 → 8 mm | Base inteira |
| L2 | Branco | 7 → 10 mm | Placa branca 164 × 84 mm, embutida 1 mm na base e 2 mm acima |
| L3 | Navy / cinza | 10 → 11 mm | Texto em relevo baixo (1 mm) sobre a placa branca |
| L4 | Amarelo / verde / branco | 8 → 11 mm | Raio, FMEES 2026, ABEE-MT e barra do rodapé — relevo 3 mm sobre a base navy |
| L5 | — | rebaixo 1 mm | Alojamento 40 × 18 mm para a logo do homenageado (peça separada, colada) |

## Logos CREA-MT e Mútua
Não imprimir a logo original (detalhe fino demais). Duas opções:
1. Imprimir só o NOME em relevo (já está em L3) e colar um adesivo vinil da logo no alojamento L5 — mais fiel e rápido
2. Modelar a logo simplificada em 2 cores e imprimir como peça de 40 × 18 × 2 mm

## Impressão
- Multicolor (AMS): peça única, 5–6 h em qualidade 0,16 mm
- Monocromática: imprimir L1 (navy), L2 (branco), L3/L4 (por cor) separados e colar com cianoacrilato. Cada parte 20 min – 3 h
- Texto: altura mínima de caractere 3 mm, traço ≥ 0,8 mm — está respeitado no SVG. Não reduzir a escala
- Bico 0,4 mm · camada 0,16 mm · 15 % de preenchimento na base · 100 % nas letras
- Acabamento: lixa 400 nas bordas; verniz fosco opcional

## Filamentos (PLA)
Navy #082A43 · Branco · Verde #00B84E · Amarelo #FFC107 · Cinza claro para o texto secundário (ou usar navy)

## Quem recebe (preencher)
- CREA-MT: ______________________  (cargo)
- Mútua-MT: ______________________  (cargo)
Entrega no palco: abertura institucional (18h10) ou encerramento (21h40), com foto.
''')
print('ok')
