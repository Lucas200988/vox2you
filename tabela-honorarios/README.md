# Tabela de Honorários AMEE 2026 — Site do evento (estático)

Site do **Lançamento da Tabela de Honorários Profissionais da Engenharia
Elétrica — AMEE 2026**, realizado pela AMEE com apoio (e subsídio) do CREA-MT
(Edital de Parceria nº 001/2026).

O foco do site é **inscrição de participantes** (R$ 20 simbólicos). O
lançamento é em 23/11, Dia do Engenheiro Eletricista, e a página trabalha a
comemoração da data com confraternização e networking em cada polo; o
churrasco é citado apenas para Cuiabá. A captação de patrocínio é secundária e fica
em uma página separada.

Segue as mesmas diretrizes do site do Fórum BESS (`../forum-bess`): HTML único,
sem build, identidade própria de documento institucional (fundo claro, Archivo + Source
Sans + IBM Plex Mono, azul e amarelo dos logos AMEE/CREA), CSS compartilhado em
`style.css`, header com logos AMEE e CREA-MT, cotas de patrocínio, contato e botão de WhatsApp.

## Dados do evento (do Plano de Trabalho)

- **Data:** 23/11/2026
- **Formato:** presencial + híbrido
- **Locais:** auditórios do CREA-MT em Cuiabá, Sorriso e Rondonópolis
- **Público estimado:** 200 participantes
- **Contrapartidas ao CREA-MT:** 250 peças (folders, convites, banner eletrônico, etc.)
- **Custo estimado:** R$ 50.000,00

## Arquivos

- `index.html` — página principal: inscrições (hero com R$ 20, o que está
  incluso, programação, passo a passo, botão para a plataforma, locais, FAQ, contato)
- `patrocinio.html` — página secundária: cota única de R$ 1.000 e contrapartidas
- `style.css` — estilos compartilhados pelas duas páginas
- `logo-abee-mt.png` — logo da AMEE/ABEE-MT
- `logo-crea-mt.png` — logo do CREA-MT

> Se algum PNG for removido, a página mostra a sigla no lugar do logo
> (fallback automático) — não fica quebrada.

## Como funciona a inscrição

Todos os botões de inscrição levam para a plataforma oficial do evento:
https://eventos.softaliza.com.br/lancamento-da-tabela-de-honorarios-profissionais-da-engenharia-eletrica

Inscrição e pagamento dos R$ 20 acontecem lá. O site não guarda dados.

## O que precisa ser revisado antes de publicar

- **Prazo de inscrição** (16/11/2026) e **certificado de participação** são
  propostas; confirme com a diretoria.
- **Churrasco:** só em Cuiabá, como está na página. Sorriso e Rondonópolis
  têm confraternização e networking.

- **Patrocínio:** cota única de R$ 1.000 (definida pela organização). Os
  benefícios listados na página são proposta; ajuste conforme a diretoria.
- **Horários da programação** são provisórios (o Plano de Trabalho define as
  atividades, mas não os horários).
- **Prazo de máxima visibilidade** (23/10/2026) foi fixado em 30 dias antes
  do evento, alinhado ao banner eletrônico no portal do CREA-MT.
- **Parceiros:** Solvaz Engenharia aparece como "Em negociação", conforme o
  Plano de Trabalho. Troque para "Confirmado" quando fechar. A Mútua foi
  retirada do site a pedido da organização.

## Como publicar na Vercel (projeto separado)

1. Em [vercel.com](https://vercel.com): **Add New → Project** e importe o repositório `vox2you`.
2. Em **Root Directory**, selecione **`tabela-honorarios`**.
3. Em **Framework Preset**, escolha **Other** (sem build).
4. **Deploy.**
5. Depois: **Settings → Domains → Add** → por exemplo `honorarios.abeemt.org.br`.
   Como o DNS do domínio já está na Vercel, o registro e o HTTPS são criados
   automaticamente.

## Contato configurado na página

- E-mail: amee.mt@gmail.com
- WhatsApp comercial: (65) 98463-3872
- Telefone AMEE: (65) 99281-2397
- Instagram: @abee_mt
- Site: www.abeemt.org.br
