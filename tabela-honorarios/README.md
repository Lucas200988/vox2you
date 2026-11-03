# Tabela de Honorários AMEE 2026 — Site do evento (estático)

Site do **Lançamento da Tabela de Honorários Profissionais da Engenharia
Elétrica — AMEE 2026**, realizado pela AMEE com apoio (e subsídio) do CREA-MT
(Edital de Parceria nº 001/2026).

O foco do site é **inscrição de participantes** (R$ 20 simbólicos, com
churrasco de confraternização). A captação de patrocínio é secundária e fica
em uma página separada.

Segue as mesmas diretrizes do site do Fórum BESS (`../forum-bess`): HTML único,
sem build, mesma estrutura, mas com identidade própria (Montserrat, grafite + ciano), nav fixa
com logos AMEE e CREA-MT, cotas de patrocínio, contato e botão de WhatsApp.

## Dados do evento (do Plano de Trabalho)

- **Data:** 23/11/2026
- **Formato:** presencial + híbrido
- **Locais:** auditórios do CREA-MT em Cuiabá, Sorriso e Rondonópolis
- **Público estimado:** 200 participantes
- **Contrapartidas ao CREA-MT:** 250 peças (folders, convites, banner eletrônico, etc.)
- **Custo estimado:** R$ 50.000,00

## Arquivos

- `index.html` — página principal: inscrições (hero com R$ 20, o que está
  incluso, programação, passo a passo, formulário, locais, FAQ, contato)
- `patrocinio.html` — página secundária: cotas e benefícios para patrocinadores
- `logo-abee-mt.png` — logo da AMEE/ABEE-MT
- `logo-crea-mt.png` — logo do CREA-MT

> Se algum PNG for removido, a página mostra a sigla no lugar do logo
> (fallback automático) — não fica quebrada.

## Como funciona a inscrição (sem backend)

O formulário não grava nada em servidor. Ao enviar, ele abre o WhatsApp da
AMEE com uma mensagem já preenchida (nome, e-mail, WhatsApp, perfil, registro
CREA, polo e empresa). Há também a opção de enviar por e-mail. A pessoa faz o
PIX de R$ 20 e manda o comprovante; a AMEE confirma a vaga manualmente.

Se quiser automatizar (planilha, pagamento online), as opções mais simples são
trocar o `<form>` por um Google Forms incorporado ou apontar o `action` para
um serviço como Formspree.

## O que precisa ser revisado antes de publicar

- **Chave PIX:** o campo `[chave PIX da AMEE — a definir]` em `index.html`
  (procure por `pix-key`) precisa ser preenchido com a chave real.
- **Prazo de inscrição** (16/11/2026) e **certificado de participação** são
  propostas; confirme com a diretoria.
- **Churrasco:** a página informa que é para participantes presenciais.

- **Valores das cotas** (Master R$ 20.000 · Ouro R$ 10.000 · Prata R$ 5.000 ·
  Bronze R$ 2.500 · Apoiador R$ 1.000) são uma **proposta** calibrada para o
  orçamento de R$ 50 mil do Plano de Trabalho. Ajuste conforme a diretoria.
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
