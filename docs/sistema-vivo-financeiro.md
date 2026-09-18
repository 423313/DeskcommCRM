# Living System Checklist — o módulo financeiro do fork

Resposta ao item 13 do Definition of Done, para as migrations 9011–9014 (profissional,
comissão, cartão de fidelidade e ficha da cliente). Cada invariante responde com o
**artefato concreto**; onde não há, está escrito que não há, e por quê.

## 1. Nada é ilha — entrada e saída

| Peça | Entrada | Saída |
|---|---|---|
| Profissional | `POST /api/v1/financeiro/catalogo/profissionais` (tela: Configurações › Financeiro) | seletor do item da comanda; `por_profissional` do relatório; tela de Comissões |
| Comissão | nasce em `fn_finalizar_comanda`, do percentual congelado no item | tela `/app/comissoes`; lançamento de saída ao fechar |
| Cartão | selo nasce em `fn_finalizar_comanda`; ajuste por `POST /financeiro/fidelidade/ajustar` | aba Ficha do contato; desconto no item ao resgatar |
| Ficha | `GET /api/v1/contacts/[id]/ficha` | aba Ficha em `app/app/contacts/[id]` |

## 2. Continuidade IA ↔ humano

Não se aplica de forma direta: nenhuma destas peças é operada pelo agente. O que existe é a
**leitura** — `fn_resumo_do_cliente` alimenta a ficha que a pessoa lê antes de atender.

⚠️ Declarado: o agente **não** sabe quanto a cliente já gastou nem quantas vezes veio. Ligar
isso ao prompt é decisão de produto com peso de LGPD (o sistema anterior excluía valor gasto
do que ia ao robô, de propósito), e não entra por tabela.

## 3. Log universal e visível — **LACUNA DECLARADA**

Audita: as três mutações (`fidelidade.premio_resgatado`, `fidelidade.cartao_ajustado`,
`financeiro.comissoes_fechadas`) gravam em `api_audit_log`.

**O que falta:** uma comanda finalizada **não** aparece na aba Timeline do contato. A ficha
mostra o histórico, a linha do tempo do CRM não.

**Por que não foi resolvido agora, com número:** `crm_lead_activities.lead_id` é `NOT NULL`,
então só dá para registrar atividade de quem tem negócio no funil. Medido em 18/09/2026 na
base do Studio: **536 contatos com comanda, 71 com lead**. Registrar só para os 71 faria a
timeline dizer "esta cliente nunca comprou" para 87% das pessoas que compraram — uma mentira
pior que a ausência.

**O que destrava:** `lead_id` nullable em `crm_lead_activities`, que é mudança no núcleo do
upstream, não no fork. Enquanto isso, a ficha é a superfície de leitura do histórico.

## 4. Nenhuma demanda sem próximo passo — **LACUNA DECLARADA**

**O que falta:** comissão `pending` que ninguém fecha não vira aviso em lugar nenhum, e
cartão completo que ninguém resgata também não. Os dois envelhecem em silêncio.

**O que existe hoje no lugar:** a tela de Comissões mostra "a receber" por profissional no
período, e a ficha mostra "Cartão completo — pode resgatar o prêmio na próxima comanda". São
superfícies de consulta, não de empurrão: quem não abrir a tela não fica sabendo.

**O caminho, quando valer:** um item em `agent_inbox_items` (a Central já existe e o cron
`recover-stuck-messages` mostra o padrão) para comissão pendente há mais de um mês. Não foi
feito porque, com **uma** profissional e a dona fechando o mês, o aviso chegaria a quem já
sabe — e alerta que ninguém precisa é o que ensina a ignorar alerta.

## 5. Informação com propósito

Cada número da ficha responde a uma pergunta do balcão: quantas vezes veio, quanto trouxe,
há quanto tempo sumiu, de quanto em quanto tempo volta, o que costuma fazer. A classificação
(ativa, em risco, inativa, perdida) existe para a decisão de reativar.

O que foi **recusado** por não ter propósito hoje: "profissional preferida" — seria um cartão
vazio em 100% das fichas, porque os 11.302 itens históricos não têm profissional.

## 6. Configuração com superfície

| Configuração | Onde se mexe |
|---|---|
| Profissionais | Configurações › Financeiro |
| Percentual de comissão | Configurações › Financeiro (regras) |
| Serviço pontuável e prêmio | colunas em `calendar_event_types` — **sem tela ainda** |
| Meta do cartão | `organizations.settings.fidelidade.meta` — **sem tela ainda** |

⚠️ Duas lacunas honestas: hoje marcar um serviço como pontuável e mudar a meta de 10 exigem
SQL. A regra existe e funciona; a superfície falta.

## 7. Todo laço se fecha

**O laço do fechamento é real e é o melhor desta entrega:** a comissão sai de "a receber" na
tela de Comissões e reaparece como **saída de dinheiro** no Faturamento, na conta que a
pessoa escolheu, ligada por `commissions.paid_entry_id`. Não há segunda cópia do total — o
lançamento é o fechamento.

**O laço do erro:** quando a finalização não gera comissão porque o item não tem
profissional, a tela avisa **antes** de finalizar, porque depois o item é imutável.

**O laço do cartão:** o resgate desconta no item e zera o saldo na mesma transação; a ficha
passa a mostrar o cartão recomeçado.
