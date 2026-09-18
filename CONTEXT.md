# CONTEXT.md — o vocabulário do módulo financeiro do fork

Glossário, e só. Decisões de arquitetura vivem em `docs/adr/`; a doutrina do fork, em
[`FORK.md`](FORK.md).

Este arquivo existe porque duas palavras deste módulo **já significavam outra coisa** no núcleo do
DeskcommCRM, e a divergência não dava erro: dava dois números certos para a mesma pessoa.

---

## Cliente

Pessoa que já foi atendida pelo estúdio. É um **contato** (`contacts`) — não existe tabela de
cliente, e não deve existir: o mesmo registro é lead antes e cliente depois.

Quem responde "é cliente?" é `contacts.first_service_at`. A etiqueta `cliente` serve para filtrar
e para o agente ler; **a coluna é que decide**.

⚠️ **O núcleo carimba `first_service_at` pela AGENDA; neste fork, a COMANDA finalizada também
carimba.** Sem isso, as 536 clientes com histórico da Belasis — que têm comanda e nunca tiveram
agendamento neste sistema — apareceriam com anos de compras e sem selo de cliente, fora dos filtros
e das automações. Medido em 17/09/2026: 536 contatos com comanda, **zero** com `first_service_at`.

Evitar: chamar de "cliente" quem só tem conversa ou lead. Evitar criar uma tela "Clientes" separada
de Contatos — a ficha é uma **aba** do contato.

## Visita

**Uma comanda finalizada e não estornada.** Duas comandas no mesmo dia são duas visitas.

É a régua do sistema anterior, mantida de propósito: a Mariana conhece esses números de cinco anos
de uso, e mudar para "dias distintos" faria 84 das 536 clientes (15,7%) exibirem um número menor
que o que ela lembra — uma diferença média de 1,4 e máxima de 5.

Evitar: usar "visita" para agendamento. Um agendamento que ninguém cobrou não é visita; quem conta
atendimento pela agenda é `fn_situacao_conta_como_atendimento`, que é outra pergunta.

## Comanda

O registro de um atendimento cobrável (`sales` + `sale_items`). Nasce aberta, é finalizada, e a
finalização é o evento que gera as consequências financeiras: lançamento, comissão e selo.

**Válida** = `status = 'finalized' and finalized_at is not null and reversed_at is null`.
⚠️ O estorno **não** muda o status: carimba `reversed_at`. Quem filtra por `status <> 'reversed'`
conta estornada como válida.

**Item finalizado é imutável.** Não há como atribuir profissional depois; o conserto é estornar e
refazer.

## Profissional

Quem executa o serviço (`professionals`). **Não é usuário do sistema**: as profissionais do estúdio
não têm login. `user_id` existe, nasce nulo, e só se preenche no dia em que alguma precisar entrar
no CRM.

Evitar: confundir com **atendente** (`user_id` do núcleo, quem responde conversa e é dono de
agendamento). São papéis diferentes, e foi por isso que o eixo da comissão deixou de apontar para
`auth.users`.

## Comissão

Percentual pago à profissional sobre o item de serviço, gerado **ao finalizar** a comanda, a partir
do percentual já congelado em `sale_items.commission_percent`.

Precedência do percentual, resolvida ao **incluir o item**: regra profissional+serviço → regra da
profissional → percentual do serviço → zero.

**Fechamento** é o pagamento de um período a uma profissional. Não existe tabela de fechamento: o
fechamento **é** o lançamento de saída, e as comissões dele apontam para ele
(`commissions.paid_entry_id`). Guardar total e quantidade numa tabela própria criaria uma segunda
cópia de número derivado, que diverge no primeiro estorno.

Evitar: "comissão paga" e "comanda paga" na mesma frase sem dizer qual — são estados de coisas
diferentes.

## Selo, cartão e prêmio (fidelidade)

**Selo**: unidade de progresso. Uma comanda finalizada com ao menos um serviço **pontuável** gera
no máximo **um** selo.

**Cartão**: o conjunto de selos até a meta (padrão 10, configurável). Completo, dá direito ao prêmio.

**Prêmio**: desconto percentual sobre o item premiado, nunca sobre o desconto da comanda.

**Resgate**: uso dos selos dentro de uma comanda aberta, que zera o cartão. Só existe esse caminho
neste fork — o "resgate avulso" do sistema anterior existia para o robô de WhatsApp, que sai de cena.

**Ajuste**: define o saldo para um valor, com justificativa. Não é resgate.

O saldo é **sempre derivado por soma** dos movimentos (`loyalty_ledger`), nunca gravado.

## Faturado

Soma das comandas finalizadas de um período. **Não** é a soma dos lançamentos financeiros.

⚠️ Os dois números divergem legitimamente, e cruzá-los reprova uma migração correta: 167 comandas
importadas da Belasis entraram como histórico de venda sem nunca terem gerado lançamento, o que dá
R$ 22.915,00 de diferença permanente. Medir **por lado**, sempre.

Evitar: chamar de "faturamento" o total de entradas do caixa.
