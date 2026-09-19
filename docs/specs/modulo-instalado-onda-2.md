# Módulo instalado — onda 2 da ADR-0002 (D3 + D6)

Estado em 19/set/2026: **desenho de implementação**, empilhado sobre o #1178 (onda 1: D4, D5 e o
molde). Issue #1114. A lei é a [ADR-0002](../adr/0002-tabelas-de-modulo-num-banco-so.md); este
documento só a transforma em peças.

## O que esta onda entrega, e o que não entrega

| Entrega | Não entrega (e por quê) |
|---|---|
| **D3** — instalar um módulo na instância cria as tabelas dele na hora | A provisionadora de um módulo concreto: nenhum módulo com tabelas está na `main`. O primeiro (financeiro/comanda) escreve o próprio corpo depois |
| **D6** — reaplicar nas atualizações é explícito, e falha alto | Tela de instalação: sem módulo real, seria uma lista vazia — não se anuncia o que não existe (doutrina, nº 11). A tela chega com o primeiro módulo |
| O registro de quais módulos estão instalados | D7 e D8 (compilar sem tabelas; LGPD/export/varreduras) — onda 3 |

**O consumidor real** é o financeiro, com seis PRs esperando. Enquanto ele não entra, o mecanismo
é provado ponta a ponta por um **módulo de teste que só existe na bateria de invariantes** — nunca
no `baseline.sql`, nunca no banco de um cliente.

## As peças

### 1. `public.modulos_instalados` — o registro da instância

Uma linha por módulo instalado: nome, estado (`ativo` | `suspenso`), quem instalou e quando, a
última reaplicação e o motivo de uma suspensão. Sem `organization_id`: o corte é por **instalação**
(ADR-0002, D3 — decisão do dono). Fechada a `anon` e `authenticated`.

### 2. `public.fn_modulo_instalar(p_actor, p_operation, p_modulo)` — a porta de instalação

`security definer`, executável só por `service_role`, busca de schema fixa. Na ordem:

1. confere no banco que o ator administra a instalação (a mesma conferência das extensões);
2. aceita só nome de módulo em forma de slug, e só se a provisionadora dele **existe** — a lista de
   módulos disponíveis é o conjunto de funções `fn_<modulo>_provisionar()` entregues pela tripla
   migration + baseline + MANIFEST. Não há segunda lista para divergir;
3. toma a trava que coordena com a atualização do núcleo e recusa se uma estiver em curso
   (não-negociável 10 da doutrina);
4. grava o recibo **no mesmo livro das extensões** (`extension_operations`, tipo novo
   `module_install`), com a chave idempotente e o `applied_now` que decide a auditoria;
5. chama a provisionadora pelo nome montado com `%I` — o nome só chega aqui depois do passo 2;
6. registra o módulo como `ativo`.

### 3. A reaplicação nas atualizações — dois comandos, de propósito

O kit aplica o `baseline.sql` **sem transação única** (`psql -f`, medido em `_common.sh`), e trata
como falha toda linha `ERROR` que não esteja na lista de erros benignos (`already exists` e afins).
Isso decide o desenho:

- **Comando A** — para cada módulo instalado, chama a provisionadora dentro de um bloco que
  captura a falha, marca o módulo `suspenso` com a mensagem original, e **não relança**. Como o
  comando se confirma sozinho, a marca de suspensão **persiste**.
- **Comando B** — se há módulo suspenso, levanta um `ERROR` com texto próprio, que não casa com
  nenhum erro benigno. O `update.sh` já coleta esse tipo de linha e avisa o operador: a
  atualização **não diz que deu certo**.

Se fosse um comando só, relançar o erro desfaria a marca de suspensão junto; e não relançar
deixaria o kit dizer "banco atualizado". Dois comandos resolvem as duas coisas sem mexer no kit.

Consequência que vale registrar: uma provisionadora que falhe com `already exists` — a mensagem
que o kit engole — **deixa de ser engolida**, porque o comando B troca o texto.

## Prova

Invariantes em **arquivos novos** (`tests/invariants/` é congelado para edição):

- instalar: recusa quem não administra a instalação; recusa módulo sem provisionadora; é
  idempotente pela chave; é recusado durante atualização do núcleo; cria as tabelas do módulo de
  teste já protegidas (usando o molde da onda 1);
- reaplicar: módulo cuja provisionadora falha fica `suspenso` **e** o comando B levanta um erro que
  não casa com a lista de benignos do kit — medido contra a própria expressão do `_common.sh`;
- superfície: `fn_modulo_instalar` fora de `public`, `anon` e `authenticated`; o registro fechado.

`pnpm test:db` local antes de abrir; sabotagem com contagem prevista antes, e commit antes dela.
