# Bancada de estado, dados e autoridade

**CONFIRMADO na bancada local, 14/set/2026:** os cinco cenários de `experiments/extensoes/state/probe.mjs` passaram em PostgreSQL **16.10** nativo, macOS ARM64, Node **22.22.3**. O ensaio usa SQL e conexões reais em um cluster exclusivo. Não altera o CRM, não publica schema e não demonstra sua jornada de instalação ou uso.

O retorno é `runProbe({ databaseUrl, repoRoot, evidenceDir })`, no contrato do PROG-019. `status: passed` cobre as verificações abaixo. As limitações continuam presentes no JSON consumido pelo console da bancada.

## Método e resultados

| Verificação | Controle e resultado observado | Consequência para a arquitetura |
|---|---|---|
| `non_owner_rls` | Duas conexões autenticadas com papéis distintos, sem superuser, sem BYPASSRLS e sem propriedade de tabela. A não lê B; insert cross-tenant recebe `42501`; update cross-tenant afeta zero linhas. Escrita direta de ativação, concessão e efeito recebe `42501`. Forjar variável de organização não muda a identidade. | A guarda da porta de capacidades precisa ser acompanhada de grants/RLS. Pertencer à organização não concede administração da extensão. |
| `old_job_schema` | Dados tipados e job v1 persistidos antes de adicionar `label`. Escritas pelos contratos v1 e v2 e leituras pelas duas projeções preservam os três registros. Valor monetário negativo é recusado pelo banco. Renomear `amount_cents` para `amount_minor` falha com job pendente e também suspenso. Após drenagem pelo contrato v1, a alteração passa e preserva o valor 250. Novas admissões e escritas v1 são recusadas. | Compatibilidade precisa consultar trabalho retido, além da versão ativa. Suspender sem resolver o destino do job não autoriza quebra de contrato. |
| `deactivation_race` | Controle vulnerável checa ativação e escreve após outra conexão desativar. Na versão protegida, `pg_stat_activity` mostra espera real `Lock/transactionid`. Desativação que vence impede a escrita; efeito que vence permanece registrado. B continua operando e concessão revogada também impede efeito. | Checagem antecipada deixa TOCTOU. Mudança de ativação/concessão e efeito local precisam compartilhar a mesma fronteira transacional. |
| `privacy_after_removal` | Fixture executada em subprocesso que termina; arquivo removido fisicamente. Uma conexão nova lê/exporta e anonimiza pelo contrato do host. Inventário cobre campos tipados, campo aditivo e payloads em jobs, outbox, recibos, invocações e resultados. Repetir anonimização não avança a revisão novamente. Entrega com payload antigo recebe `privacy_revision_stale`; B e timestamp histórico permanecem iguais. | Contratos de dados e seus tratadores precisam sobreviver ao pacote, acompanhar evolução de campos e impedir reintrodução por trabalho antigo. |
| `resumable_operation` | Efeito e etapa são commitados; a conexão fecha antes da finalização. Outra conexão encontra `effect_committed`, confere o efeito e finaliza. Repetição deixa um único efeito, etapa `complete` e próximo passo `none`. Schema continua em v3. | Recibo persistente e pós-condição orientam retomada. Trocar código ou retomar operação não restaura banco. |

As medidas de duração estão em `state-report.json`; uma execução de referência levou **156 ms**, e esse número é duração de um ensaio sintético, sem valor de SLA ou dimensionamento.

### A corrida foi sabotada

Foi retirado temporariamente o `FOR UPDATE` de `apply_effect` na fixture. O resultado mudou para `failed` em `deactivation_race`, com `A segunda conexão não esperou o lock esperado`. A fixture foi restaurada e os cinco cenários passaram novamente. Evidência: `state-mutation-no-lock.json`.

O controle vulnerável utiliza deliberadamente o escritor privilegiado da bancada depois de uma leitura desatualizada. Ele representa uma implementação incorreta do host. A função protegida é chamada por conexão não-dona e consulta `session_user` numa tabela de identidades que esses papéis não podem alterar.

## Contratos persistidos

`fixture.sql` cria somente `bench_state`, com ativação/concessão por organização, sujeitos sintéticos, registros tipados, jobs, inventário, cópias, operações e efeitos. `rls_canary` é uma tabela de controle com DML permitido e RLS, usada para separar recusa por policy de recusa por falta de grant. Não é entidade de produto.

`additive.sql` acrescenta `label` e o inclui no inventário pessoal. O tratador durável admite tanto a ausência dessa coluna no contrato inicial quanto sua presença após evolução. `incompatible.sql` segura a mesma linha de instalação que a admissão de jobs usa: alteração incompatível exige ausência de jobs pendentes/suspensos antigos. O ensaio grava próximo passo explícito ao suspender e drena pelo contrato antigo antes da renomeação.

Funções de host são `security definer`, com `search_path` fechado, tabelas qualificadas e filtro explícito de organização resolvida de `session_user`. O acesso a funções é revogado de `PUBLIC`. Os dois papéis sintéticos recebem apenas as funções e os acessos definidos na fixture. Essa forma de mapear conexões por tenant é **instrumentação de teste**, não proposta de autenticação do CRM.

O ensaio de privacidade mantém um marcador durável de anonimização e sua revisão. A entrega antiga conserva em memória um payload sintético anterior; mesmo assim, a guarda consulta o estado atual do sujeito sob lock antes de escrever. A exportação inclui cópias aninhadas de payload e preserva dados históricos não pessoais. A revisão não aumenta ao repetir a mesma anonimização.

## Reprodução

Prepare o cluster exclusivo com os comandos gerais da bancada. `readContext` lê seu marcador local; nenhum `.env` é aberto. Antes de qualquer mutação de banco, `assertBenchDatabase` confirma URL, identidade do cluster, banco, proprietário e diretório físico. Apenas apontar para uma porta local não basta.

Na raiz da worktree:

```bash
node --input-type=module - <<'NODE'
import { runProbe } from './experiments/extensoes/state/probe.mjs';
import { readContext, writeJsonAtomic } from './experiments/extensoes/common.mjs';
const context = await readContext(process.cwd());
const result = await runProbe(context);
await writeJsonAtomic(context.evidenceDir + '/state-report.json', result);
process.stdout.write(JSON.stringify(result, null, 2) + '\n');
if (result.status !== 'passed') process.exitCode = 1;
NODE

node --check experiments/extensoes/state/probe.mjs
pnpm exec eslint experiments/extensoes/state/probe.mjs
```

Artefatos locais em `.superpowers/evidence/extensoes-bancada/`: `state-report.json`, `state-redacted-export.json` e `state-mutation-no-lock.json`. Só dados sintéticos são gerados. A remoção afeta exclusivamente o arquivo criado em um subdiretório `state-executable-*` desse diretório. Os relatórios não devem ser confundidos com dados ou logs de clientes.

Cada execução serializa esta frente com advisory lock e recria somente `bench_state`; não apaga `public`, não reinicia o banco e não para o cluster compartilhado com a frente de eventos. Os papéis `bench_state_tenant_a/b` permanecem para reexecução. Falta de infraestrutura retorna `blocked`; falha de verificação após preparar a bancada retorna `failed`.

## Limites e decisão técnica

**Não medido:** baseline completo do CRM; piso PostgreSQL 15/Supabase; PostgREST/RPC HTTP; autenticação real/RBAC; UI de administração ou Central; pacote real versionado com digest; atualização real do CRM após desinstalação; catálogo/registro desligado; storage externo, backups/restore, retenção por prazo ou inventário automático de campos. Nenhum `test:db` ou E2E do produto é substituído por este ensaio.

As escritas do ensaio são locais ao banco. Ele **não** prova atomicidade entre commit e envio externo, revogação de credencial em provedor remoto ou recuperação de resposta externa incerta. A interrupção medida é o fechamento de conexão entre etapas já duráveis; não simula desligamento da máquina, recuperação de WAL ou desastre de disco.

O inventário é revisado e explícito. Não há garantia sobre cópias desconhecidas, conteúdo pessoal em campos que um pacote omitiu, dumps ou processos externos. Essa cobertura exige o perfil de dados e a admissão do pacote. A fixture não concede SQL livre a uma extensão.

**INFERIDO a partir dos resultados:** a arquitetura aprovada é viável para um primeiro perfil de dados tipados com tratadores do host. A unidade de serialização da ativação pode ser organização/extensão e a admissão de jobs precisa compartilhar a trava da evolução incompatível. A decisão final sobre schema independente continua dependendo de runner verificável, backup/restore e integração ao produto; esta bancada não os entrega.

## Sistema Vivo nesta etapa

A entrada é o contexto exclusivo passado a `runProbe`; a saída é o relatório estruturado consumido pelo console experimental. Os registros concretos são `operations`, `jobs`, `effects` e os JSON de evidência. A porta/tela é responsabilidade da integração do console no PROG-019; nenhuma rota do CRM foi criada nesta frente. Jobs suspensos têm próximo passo, operações interrompidas têm etapa verificável e resultado `failed/blocked` orienta correção e nova execução. A continuidade IA↔humano, navegação e mapa de runtime do CRM não se aplicam à fixture; continuam requisitos da futura entrega do produto. As arestas experimentais são **console → runProbe → PostgreSQL → relatório → console**.
