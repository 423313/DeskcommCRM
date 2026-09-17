# FORK.md — o modulo financeiro fora do upstream

Este fork carrega **uma coisa**: comanda, financeiro, comissao e fidelidade.
Tudo o mais e espelho do upstream (`melgarafael/DeskcommCRM`).

O modulo esta em espera no upstream por arquitetura, nao por qualidade: ele so
entra quando existir instalacao de banco independente por extensao (issue #792,
decisao de 16/09/2026). Ate la, vive aqui.

## Remotes

| Nome | Aponta para |
|---|---|
| `origin` | upstream, `melgarafael/DeskcommCRM` — **nunca receba push** |
| `fork` | `423313/DeskcommCRM` — e para ca que vai o seu trabalho |

## Branches

- `fork/financeiro` — a unica branch de trabalho. Todo o modulo vive nela.
- Nao mantenha a pilha de sete branches empilhadas: ela multiplicava por sete o
  custo de cada sync, e os PRs upstream ja registram a historia fatiada.

## O ciclo

```bash
bash scripts/fork-setup.sh   # uma vez por arvore
bash scripts/fork-sync.sh    # TODA SEMANA
```

Semanalmente, nao trimestralmente. O upstream faz ~2.500 commits por mes; uma
semana de atraso e meia hora de trabalho, tres meses e reescrita.

## As tres convencoes que evitam quase toda a dor

1. **Migration do fork usa a faixa `9001+`.** O upstream produz ~5 migrations por
   dia e ja chegou a `0264` — qualquer numero baixo colide. A faixa alta nunca
   colide e deixa obvio no diff o que e seu.

2. **`supabase/baseline.sql` e DERIVADO: nao edite.** O que e seu mora em
   `supabase/fork-apendice.sql`. O `fork-sync.sh` regenera o baseline como
   *upstream puro + apendice*. Editar o baseline direto ressuscita o conflito de
   900 linhas que essa separacao existe para matar.

3. **Escreva sempre no FIM** de `lib/audit/actions.ts`, `lib/i18n/dicionario.ts` e
   `supabase/migrations/MANIFEST.md`. O `fork-setup.sh` marca os tres como
   `merge=union`, e o git passa a resolve-los sozinho — mas so funciona se os dois
   lados acrescentarem no fim.

## O que o git NAO vai avisar

Conflito de texto e o problema facil, e o esqueleto ja o resolve. O que quebra um
fork longo e **mudanca de contrato** no upstream: uma tabela que voce referencia
muda de forma, `ok()`/`fail()` mudam de assinatura, a RLS troca de helper. O
merge fica verde e o codigo fica errado.

Quem pega isso e `pnpm test:db` — o unico gate que aplica o `baseline.sql` num
Postgres real. Rode-o em todo sync, nao so quando mexer em schema.

## Quando o modulo voltar para o upstream

A camada de baixo (contas, formas de pagamento, plano de contas, lancamento
avulso) **ja foi aceita no nucleo**. Quando ela entrar, sai daqui, e este fork
encolhe para comanda + comissao + fidelidade — menos superficie compartilhada,
sync mais barato.
