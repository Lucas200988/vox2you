# Fórum BESS 2026 — Media Kit (site estático)

Página de captação de patrocínio do **Fórum Mato-Grossense de Engenharia Elétrica
e Energias Sustentáveis 2026 (BESS)**, organizado pela ABEE-MT.

É um site **estático** (HTML único), independente do app Next.js na raiz do repositório.

## Arquivos

- `index.html` — a página completa
- `logo-abee-mt.png` — logo da ABEE-MT *(precisa ser enviado)*
- `logo-crea-mt.png` — logo do CREA-MT *(precisa ser enviado)*
- `logo-mutua.png` — logo da Mútua *(precisa ser enviado)*

> Enquanto os PNGs não forem enviados, a página mostra a sigla no lugar do logo
> (fallback automático) — não fica quebrada.

## Como publicar na Vercel (projeto separado)

1. Em [vercel.com](https://vercel.com): **Add New → Project** e importe o repositório `vox2you`.
2. Em **Root Directory**, selecione **`forum-bess`**.
3. Em **Framework Preset**, escolha **Other** (sem build).
4. **Deploy.**
5. Depois: **Settings → Domains → Add** → `forumbess.abeemt.org.br`.
   Como o DNS do domínio já está na Vercel, o registro e o HTTPS são criados
   automaticamente.

## Como enviar os logos pelo GitHub (sem terminal)

1. Abra a pasta `forum-bess` no GitHub, na branch de trabalho.
2. **Add file → Upload files.**
3. Arraste os 3 PNGs (com exatamente estes nomes: `logo-abee-mt.png`,
   `logo-crea-mt.png`, `logo-mutua.png`).
4. **Commit changes.** A Vercel re-publica sozinha.

## Contato configurado na página

- E-mail: amee.mt@gmail.com
- WhatsApp: (65) 98463-3872
- Instagram: @abee_mt
- Site: www.abeemt.org.br
