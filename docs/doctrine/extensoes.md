# Doutrina de Extensões

> Lei sobre o que entra no **núcleo** do DeskcommCRM e o que entra como **extensão** instalável, e
> sobre o que uma extensão pode ou não fazer dentro de uma instalação. Complementa
> [`sistema-vivo.md`](./sistema-vivo.md) (toda peça tem entrada, saída, registro e laço de retorno)
> e [`packaging.md`](./packaging.md) (nada constrói na VPS do cliente). Amarrada ao item 18 do
> Definition of Done (`CLAUDE.md`).

Esta é a **lei**. As decisões e o que foi recusado vivem nos documentos de decisão:

| Se você quer… | Vá para |
|---|---|
| o critério núcleo × extensão aprovado e o desenho do programa inteiro | `Decisão Implementações/PROG-017 — Extensões — arquitetura e contratos.md` |
| as políticas de publicação, incidentes e métricas (Rafael aprovou A nas três) | `Decisão Implementações/DEC-004 — Extensões — publicação, incidentes e métricas.md` |
| o contrato que existe hoje (pacote, catálogo, RPCs, portas HTTP, versões) | [`../specs/extensoes-declarativas-v1.md`](../specs/extensoes-declarativas-v1.md) |
| classificar o destino de um PR de contribuidor | [`../../triagem/TRIAGEM.md`](../../triagem/TRIAGEM.md), seção 2-bis |
| o mapa das peças e das arestas | [`../architecture/extensoes-declarativas.architecture.json`](../architecture/extensoes-declarativas.architecture.json) |

---

## O princípio-raiz

A pergunta não é *"isto serve a muita gente?"*. Ser útil a vários setores é indício de reuso, não
obrigação de ficar ligado para todos. A pergunta é:

> **"Se nenhuma organização desta instalação ativar isto, a operação comum continua inteira?"**

Se sim, o recurso pode ser extensão. Se não, porque identidade, autorização, isolamento, auditoria,
contratos ou a cadeia de envio dependem dele, ele é núcleo. **O núcleo continua útil com zero
extensões**, e é isso que mantém o produto genérico enquanto os nichos ganham espaço.

## A régua do destino

| Destino | O que sustenta a classificação |
|---|---|
| **Núcleo** | Operação comum ou garantia compartilhada: contatos, conversas, funis, identidade, autorização, trilha de ações, infraestrutura de IA, cadeia de envio. Correção de comportamento já entregue continua no componente responsável. |
| **Extensão** | Jornada adicional, aparência, integração ou especialização de nicho, com configuração, dados e manutenção próprios, cuja ausência não compromete a operação comum. Exemplos: comanda, comissão, fidelidade, financeiro, temas. |
| **Ambos** | Um ponto genérico no núcleo e uma extensão que o consome. O ponto só entra com **consumidor real, contrato e prova dos dois lados**; não existe inventário de ganchos hipotéticos. |
| **Infraestrutura/documentação** | Mudança sem capacidade nova para o usuário; declare a superfície que ela mantém. |

Todo PR que muda comportamento declara o destino e a razão (DoD 18). Enquanto a plataforma está em
construção, "extensão" é destino, não exigência de usar uma ferramenta que ainda não existe:
preserve o trabalho do contribuidor e registre a dependência.

---

## Os não-negociáveis

1. **Zero extensões é um estado de primeira classe.** Nenhuma tela, rota ou fluxo do núcleo pode
   exigir uma extensão ativa. Desligar ou remover uma extensão nunca tira do ar uma jornada do
   núcleo. *Provado hoje em:* J24 — o guia só abre Tarefas, e Tarefas não dependem da ativação.

2. **Extensão pede capacidade; não importa o código interno nem lê o banco.** O contrato é uma ação
   nomeada e estável (hoje, `tasks.open`), revalidada no servidor a cada uso. O pacote não recebe
   cliente Supabase, variável de ambiente, shell, JavaScript, SQL nem dados do CRM. Uma capacidade
   só abre uma porta que o núcleo já tem, com a autorização habitual dela.

3. **Instalar não é autorizar.** Instalar uma extensão não concede autoridade para enviar mensagem,
   movimentar dinheiro, mudar permissão ou alcançar outra organização. Toda escrita do framework
   é RPC `service_role` que revalida no banco o ator, a organização e o papel **atuais**; nenhum
   dos dois vem do corpo HTTP.

4. **A instância decide o pacote; a organização decide o uso.** Admitir catálogo, instalar,
   atualizar, desfazer e remover são do administrador da instalação (plataforma, escopo `full`,
   MFA quando exigido, fora de acompanhamento de suporte). Ativar e configurar são do administrador
   da organização. A plataforma **não reativa** uma decisão que é da organização: depois de uma
   reinstalação, cada organização ativa de novo.

5. **Toda operação é um recibo durável com saída pela tela.** Pedido com chave idempotente;
   repetição idêntica devolve o mesmo recibo, e a mesma chave com outro pedido é conflito. Toda
   preparação tem falha, cancelamento, invalidação e retomada alcançáveis pela tela. A RPC diz se
   a chamada fez a transição (`applied_now`), e a auditoria grava só nesse caso.

6. **Toda troca de ponteiro exige a precondição do que a tela viu.** Atualizar, trocar, desfazer,
   remover e reinstalar levam a revisão da instalação exibida; divergência recusa e recarrega. Uma
   aba antiga nunca rebaixa versão nem desfaz uma remoção em silêncio.

7. **Tirar é lógico e preserva dados; apagar é outra ação.** Desativar preserva a configuração.
   Remover da instalação desliga os vínculos ativos, marca o motivo e mantém recibos, artefatos e
   configuração. Apagar dados de uma extensão, quando existir dado de extensão, é ação separada,
   com consequência explícita e as regras de LGPD do domínio.

8. **O instalado não depende do catálogo.** Artefatos, contratos, configuração e a admissão ficam no
   banco local. Catálogo fora do ar impede só novos downloads; desfazer a última troca funciona
   sem ele. Admissão manual de catálogo **não é TUF**, e não criamos protocolo criptográfico
   próprio: a distribuição pública espera o verificador mantido descrito no PROG-017 §11.

9. **Schema de extensão segue a doutrina de migrations.** Migration versionada + apêndice idêntico no
   `baseline.sql` + MANIFEST; `revoke execute … from public, anon`; vocabulário com CHECK tem par
   em `tests/invariants/vocabulario-banco-x-typescript.test.ts`. Tabelas de instância ficam
   fechadas a `anon`/`authenticated`; leitura por organização passa por RLS.

10. **Publicar espera o sistema; tirar não espera.** Preparar, concluir e desfazer recusam enquanto
    há atualização do core `dispatched` há menos de 15 minutos (`RUN_STALE_AFTER_MS`). Remover não
    consulta o core. A atualização do core recusa enquanto há preparação de extensão.

11. **Não anunciar o que não existe.** Chamar uma pasta de "plugin" não a torna extensão: um
    candidato precisa de instalação, permissões, compatibilidade, atualização, desativação e
    preservação de dados. Tela, README ou changelog não prometem SDK, execução isolada de código,
    marketplace público ou avaliações antes da prova deles.

12. **Recurso já distribuído não é extraído do núcleo sem equivalência e migração.** Classificar algo
    como "seria extensão" não autoriza removê-lo, desligá-lo em massa nem mudar o que um cliente
    já usa. A extração exige comportamento equivalente demonstrado e migração explícita.

---

## O que existe hoje e o que ainda não existe

| Existe (perfil declarativo v1) | Ainda não existe |
|---|---|
| Catálogo admitido manualmente, download preso à origem com guarda de SSRF | Distribuição pública verificada (TUF) e catálogo compartilhado |
| Pacote JSON estrito com cards de orientação e a capacidade `tasks.open` | Execução de código de terceiros, isolada |
| Instalar, atualizar, trocar, desfazer a última troca, remover e reinstalar | Histórico de mais de um passo; versão por organização |
| Ativação e configuração por organização, com teto de 8 ativas | Dados de domínio próprios da extensão e suas migrations |
| Recibos, auditoria por organização na remoção, Atividade recente | Dependências entre extensões, avaliações, métricas de adoção |

Quem propõe um item da coluna da direita abre decisão nova e prova antes; não amplia o perfil
declarativo por dentro.

## Verificação

- Banco: `tests/invariants/extensoes-declarativas.test.ts` (autoridade, isolamento, idempotência,
  precondição, corrida entre ativar e remover, coordenação com o core), por `pnpm test:db`.
- Serviço e tela: os testes co-localizados em `lib/extensions/` e `components/extensions/`, por
  `pnpm test:unit` sem caminho.
- Tela: `tests/e2e/extensoes-declarativas.spec.ts`, `tests/e2e/extensoes-recuperacao.spec.ts` e
  `tests/e2e/extensoes-versao.spec.ts` (J24 e J25 em `docs/testing/user-journey-map.md`).
- Códigos do banco: `lib/extensions/erros-do-banco.test.ts` exige frase e status para todo código
  que a migration levanta.
