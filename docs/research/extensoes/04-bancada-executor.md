# Bancada do executor de extensões

Medido em 2026-09-14, sobre a bancada isolada de `experiments/extensoes/runtime/`.
**CONFIRMADO:** os 14 controles do ensaio passaram em Wasmtime 48.0.0, macOS ARM64,
Python 3.14.6 e Node 22.22.3. A comparação com contêiner ficou **bloqueada**: o daemon
não respondeu ao `/_ping` em dois segundos nos dois sockets locais testados.
Isso não prova a integração ao CRM nem conclui a escolha de implantação na VPS.

## Pergunta e fronteira testada

O ensaio pergunta se um módulo Wasm core consegue executar uma capacidade sintética,
sem escolher a organização ou o ator do host, e se falhas de execução ficam contidas.
O guest recebe somente um ID inteiro de registro. O broker mantém organização,
ator e concessões num objeto imutável do lado Python e confere o registro antes da
leitura. Dois registros sintéticos pertencem a organizações diferentes; nenhum
banco do CRM participa deste ensaio.

Não há configuração WASI, diretório preaberto, socket, variável de ambiente ou
credencial entregue ao guest. O processo Python confiável lê as fixtures locais e
a biblioteca Wasmtime. O supervisor Node inicia esse processo com ambiente constante
contendo apenas `PATH`, `LANG` e `PYTHONIOENCODING`, e Python em modo isolado `-I`.
O parâmetro `databaseUrl` do contrato comum é ignorado por esta frente.

## Reprodução

Com o ambiente virtual da bancada já preparado com `wasmtime==48.0.0`:

```bash
node experiments/extensoes/runtime/verify.mjs
pnpm exec eslint experiments/extensoes/runtime/*.mjs
```

O primeiro comando executa Wasmtime de fato, valida o contrato e grava todas as
amostras em `.superpowers/evidence/extensoes-bancada/runtime-report.json`.
Ele também verifica que a ausência do venv produz `blocked`, sem controles aprovados.
Um caminho alternativo de evidência pode ser passado como primeiro argumento;
o Python é sempre procurado em `<evidenceDir>/venv/bin/python`.

A integração usa `runProbe({ repoRoot, evidenceDir, databaseUrl })` exportado em
`experiments/extensoes/runtime/probe.mjs`. Erros inesperados produzem `failed`.
`passed` cobre os controles executados; o objeto separado
`measurements.container_comparison.status` continua `blocked`.

## Parâmetros experimentais

| Recurso | Limite usado | Onde é imposto |
|---|---:|---|
| Execução do guest | 100.000 unidades de fuel | Store do Wasmtime |
| Memória linear | 131.072 bytes, uma memória | Store do Wasmtime |
| Instâncias/tabelas | Uma instância, uma tabela, 100 elementos | Store do Wasmtime |
| Saída do guest | 1.024 bytes acumulados por execução | Broker, antes da cópia |
| Protocolo stdout + stderr do processo | 131.072 bytes | Supervisor Node |
| Prazo total de processo | 10.000 ms | Supervisor Node |
| Chamada do host travada | 750 ms após entrada confirmada | Supervisor Node |
| Concorrência | Dois processos para oito tarefas | Fila local da bancada |

Os limites são parâmetros do ensaio, não SLA ou orçamento publicado do produto.
`Store.set_limits` cobre a memória linear, não o RSS inteiro do processo.
`consume_fuel` e `set_fuel` habilitam o limite de execução do guest.
Essas APIs foram conferidas na [documentação oficial do binding Python](https://bytecodealliance.github.io/wasmtime-py/).

## Resultados dos controles

| Controle | Resultado observado |
|---|---|
| Capacidade autorizada | `read_record(1)` devolveu 41; auditoria sintética preservou organização e ator do host |
| Outra organização | Registro 2 foi recusado com `capability_denied` |
| Sem concessão | Leitura do registro da própria organização foi recusada |
| Filesystem | Import `wasi_snapshot_preview1::path_open` recusado na instanciação |
| Rede | Import `wasi_snapshot_preview1::sock_accept` recusado na instanciação |
| Loop infinito | Trap por esgotamento de fuel |
| Memória inicial excessiva | Instanciação com três páginas recusada |
| Crescimento excessivo | `memory.grow(2)` retornou -1; memória continuou em uma página |
| Saída excessiva | 1.025 bytes recusados antes da cópia |
| Saída cumulativa | Duas emissões de 600 bytes recusadas ao ultrapassar a cota |
| Saída no limite | 1.024 bytes aceitos |
| Versão | Binding instalado conferido como 48.0.0 |
| Host travado | `SIGKILL`, processo ausente e nova execução retornando 41 |
| Concorrência | Oito tarefas válidas, máximo observado de dois processos ativos |

Cada um dos onze controles Python termina com uma nova instância válida retornando
41 no mesmo processo. O controle de host travado usa um processo separado e confirma
a recuperação com outro processo. A rejeição de saída cumulativa pode preservar o
prefixo de 600 bytes no buffer interno; ele não é publicado pela bancada.

O teste de rede mede resolução de imports, sem tentar egress real. Wasm só dispõe
das interfaces explicitamente ligadas pelo host; a prova não cobre uma futura
capacidade HTTP concedida, nem seus controles de destino. A fronteira é descrita
na [documentação de segurança do Wasmtime](https://docs.wasmtime.dev/security.html).

## Medições da execução registrada

| Medida | Amostra | Resultado |
|---|---:|---|
| Processo novo: Python, import, compilação WAT, instanciação e chamada | 5 | Média 135,476 ms; mínimo 127,088; máximo 151,700 |
| Engine + compilação + instanciação + chamada, após imports Python | 5 | Média 2,423 ms; mínimo 2,240; máximo 2,585 |
| Chamada quente na mesma instância, incluindo broker Python | 50 | Média 0,026497 ms; mínimo 0,023625; máximo 0,082709 |
| Oito processos novos em fila com concorrência dois | 8 | Total 779,062 ms; média por processo 193,084 ms |
| Pico RSS do processo da suíte | 1 | 40.239.104 bytes |
| Pico RSS individual dos processos concorrentes | 8 | 36.372.480 a 36.962.304 bytes |
| CPU de usuário + sistema do processo da suíte | 1 | 0,152515 s |
| Encerramento após entrada no host travado | 1 | 754,245 ms; prazo configurado 750 ms |

Amostras de processo novo, em ms: `135.214459, 129.858084, 127.088250,
133.518125, 151.700291`. As cinquenta amostras quentes e as oito concorrentes estão
preservadas no JSON da evidência. São medidas de uma máquina compartilhada:
processo novo não significa cache de disco frio. Não foram publicados percentis
nem projeções de capacidade. O pico RSS usa `getrusage`: bytes no macOS, convertido
de KiB nos sistemas Linux. Picos individuais não representam pico simultâneo total.

O supervisor começa o prazo específico quando recebe a confirmação de entrada da
função host que dorme indefinidamente. Ao vencer, envia `SIGKILL`; só resolve depois
do evento `close` e verifica `ESRCH` ao consultar o PID. Não é apenas uma promessa
abandonada por timeout. O prazo total continua protegendo a fase anterior à entrada.
O desvio de aproximadamente 4 ms observado é atraso de agendamento/encerramento,
não promessa de precisão do temporizador.

## Comparação com contêiner

`GET /_ping` em `/var/run/docker.sock` e `~/.docker/run/docker.sock` expirou em
2.006,889 e 2.003,011 ms, respectivamente. Nenhum contêiner foi criado, nenhum daemon
reiniciado e nenhum serviço compartilhado alterado. Perfil e medições de contêiner
ficaram `null` no relatório.

Para concluir a comparação é necessário um daemon funcional e uma imagem imutável,
com CPU, memória, processos, usuário, filesystem, rede e privilégios declarados.
O código atual apenas diagnostica disponibilidade: mesmo se o daemon voltar, a
comparação segue bloqueada até haver perfil e execução equivalentes implementados.

## Consequência para a arquitetura

**CONFIRMADO:** a combinação testada contém o loop infinito, as tentativas de
memória/saída excessivas e a chamada host travada. A autoridade mantida no broker
recusa acesso cruzado no conjunto sintético. O desenho de executor separado e
supervisionado tem uma prova de mecanismo reproduzível.

**INFERIDO:** reutilização controlada de módulos/engines pode amortizar a inicialização,
porque a chamada quente desta fixture é muito menor que o processo novo. A bancada
não mede o custo de um SDK JavaScript, de JSON real, do broker remoto ou de isolamento
entre sucessivas execuções reais; ainda não justifica escolher um pool de produção.

**PENDENTE:** Linux amd64 com quotas de processo, comparação com contêiner, carga
prolongada e competição entre organizações; limites de compilação de artefatos grandes;
Component Model/WIT; validação de pacote real; transporte, autenticação e RBAC do
broker do CRM; persistência transacional e cancelamento/idempotência de efeitos
remotos. Matar o processo não desfaz uma requisição já aceita por outro serviço.
O experimento não escolhe Python como linguagem de entrega nem torna extensões um
recurso pronto do produto.
