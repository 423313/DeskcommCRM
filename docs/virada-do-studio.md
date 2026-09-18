# A virada do Studio — ficha, comissões e cartão em produção

Runbook da atualização para a `v2026.9.2`. Feito para ser **executado**, não
decidido na hora: as escolhas estão tomadas e escritas abaixo.

> **Fora do horário de atendimento.** A troca da coluna de "quem atendeu" abre
> uma janela de minutos em que o banco já mudou e a imagem ainda não — lançar
> comanda nessa janela dá erro. Domingo ou depois das 22h.

## Antes de começar

| Item | Valor |
|---|---|
| VPS | `143.95.165.137`, porta **22022**, usuário `root` |
| Pasta | `/root/deskcommcrm` |
| Domínio | https://crm.cursomarianacastro.com |
| Versão atual | `2026.9.1` |
| Versão alvo | `2026.9.2` |
| Organização | `9f938923-a0c1-466e-ab3f-86013f3dab30` |

## 1. Publicar (na máquina de desenvolvimento)

```bash
cd /c/Users/Pedro/dc-fork
bash scripts/fork-sync.sh && pnpm install
pnpm typecheck && pnpm test:unit && pnpm test:db     # os três, antes da tag
git push fork fork/financeiro:main
git tag -a v2026.9.2 -m "base upstream: v1.33.0 — ficha da cliente, comissões, cartão de fidelidade"
git push fork v2026.9.2
```

Espere o CI e confira que as três imagens existem **e são públicas**:

```bash
source hostgator-setup-kit/_common.sh
ghcr_status deskcommcrm 2026.9.2
ghcr_status deskcomm-worker 2026.9.2
ghcr_status deskcomm-scheduler 2026.9.2     # quer 200 nas três
```

Pacote novo no GHCR nasce privado. Se vier 403, torne público em
`github.com/users/423313/packages` antes de seguir.

## 2. Atualizar a VPS

```bash
ssh -p 22022 -i ~/.ssh/deskcomm_vps root@143.95.165.137
cd /root/deskcommcrm
bash hostgator-setup-kit/backup.sh
git fetch --tags origin
bash hostgator-setup-kit/update.sh
bash scripts/fork-doutor.sh                    # quer cinco linhas verdes
cp supabase/fork-apendice.sql /root/fork-apendice.sql
```

**A migration 9014 imprime dois avisos**, e eles são a prova de que o histórico
foi reconhecido:

```
9014: N contato(s) curados de uma versão anterior desta migration
9014: N contato(s) passaram a ser cliente pela comanda
```

## 3. Conferir que deu certo

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://crm.cursomarianacastro.com/app/comissoes   # 307
curl -s https://crm.cursomarianacastro.com/api/v1/health | grep -o '"version":"[^"]*"'      # 2026.9.2
```

E pela tela, logado:

1. **Contatos** → uma cliente antiga → aba **Ficha**: visitas, total gasto e
   histórico batendo com o que a Mariana lembra.
2. **Contatos**: as clientes com histórico aparecem com a etiqueta `cliente`.
3. **Análise › Comissões**: abre (vazia, porque ainda não há profissional).
4. **Análise › Faturamento**: os números do mês.

### Se algo estiver errado

O resgate é uma linha: as três `*_IMAGE` do `.env` de volta para
`ghcr.io/423313/...:2026.9.1` e `docker compose ... up -d`. Os **dados não se
perdem** — estão no Supabase, e nenhum caminho do update os toca. O estado
anterior está em `/root/rollback-antes-do-fork-20260917.txt`.

## 4. Configurar o que só funciona com decisão humana

Nada disso é automático, e o módulo fica pela metade sem esses três passos.

### 4.1 As profissionais

**Configurações › Financeiro › Profissionais**: cadastrar **Mariana Thays de
Castro** e **Scarlet** (as duas ativas no sistema anterior).

### 4.2 As regras de comissão

Mesma tela, bloco **Regras de comissão**. No sistema anterior o percentual era
**55%**. Sem regra, a comissão nasce zero e a tela de Comissões fica vazia para
sempre.

Decisão pendente: se o percentual difere por serviço, cadastre regra
específica (profissional + serviço), que vence a geral.

### 4.3 O cartão de fidelidade

⚠️ **Ainda não tem tela.** Marcar quais serviços dão selo e qual é o prêmio
exige SQL, via `/root/q.sh`:

```sql
-- os serviços que DÃO selo
update public.calendar_event_types
   set fidelidade_pontua = true
 where organization_id = '9f938923-a0c1-466e-ab3f-86013f3dab30'
   and name in ('...', '...');          -- escolher com a Mariana

-- o serviço que É o prêmio, e o desconto dele
update public.calendar_event_types
   set fidelidade_premio_percentual = 50
 where organization_id = '9f938923-a0c1-466e-ab3f-86013f3dab30'
   and name = '...';

-- a meta, se for diferente de 10
update public.organizations
   set settings = coalesce(settings, '{}'::jsonb) || '{"fidelidade":{"meta":10}}'::jsonb
 where id = '9f938923-a0c1-466e-ab3f-86013f3dab30';
```

No sistema anterior **reparo, remoção, cutilagem e curso NÃO pontuavam**.

## 5. Migrar o histórico do sistema anterior

Depois da virada, e **com o sistema antigo parado de receber comanda**:

```bash
LEGADO_URL=https://kreltubqfoxrqkndnbtr.supabase.co/rest/v1 \
LEGADO_KEY=<service role do projeto antigo> \
SUPABASE_DB_URL=<a do .env da VPS> \
ORG_ID=9f938923-a0c1-466e-ab3f-86013f3dab30 \
pnpm tsx scripts/migrar-do-legado.ts            # confere e NÃO grava
```

Leia a saída antes de repetir com `--aplicar`. O script conta a ORIGEM na hora
— o sistema antigo continua operando, e números fixos envelheceriam entre uma
execução e a seguinte.

⚠️ **A ordem importa, e foi medida:** em 17/09 havia **8 comissões apontando
para comandas que não existem aqui** (as de número 4807 a 4814, lançadas depois
da carga). O script nomeia cada uma. Trazer essas comandas exige a carga
original (`.superpowers/evidence/fase44-gerar-sql.mjs`), que roda antes.

## O que fica pendente depois de tudo isso

Declarado, não esquecido:

1. **Tela para serviço pontuável e meta do cartão** — hoje é SQL.
2. **A comanda não entra na timeline do contato.** `crm_lead_activities.lead_id`
   é obrigatório e só 71 das 536 clientes têm negócio no funil; registrar só
   para elas faria a timeline mentir para 87%.
3. **Comissão pendente não vira aviso ativo.** Com uma profissional e a dona
   fechando o mês, o alerta chegaria a quem já sabe.
4. **O resgate de prêmio não tem prova em tela** (exige dez selos; coberto por
   invariante).
5. **As comissões pagas do sistema anterior entram sem lançamento de caixa** —
   foram pagas fora deste sistema, e inventar a saída agora criaria dinheiro
   saindo hoje por pagamento de julho.
