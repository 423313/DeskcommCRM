# Plataforma de extensões — pesquisa de arquitetura

**14/set/2026. Investigação e proposta, ainda sem implementação ou jornada E2E nova executada.**

Referência de código: `25edc35b05c8d522e2bfe313863e6003f47b8f56`, obtida de `origin/main` para esta pesquisa. Os caminhos e as linhas dos relatórios descrevem essa fotografia; outras branches ou commits podem ter comportamento diferente.

## Entrada para acompanhar e decidir

| Documento | Conteúdo |
|---|---|
| [PROG-016 — Plano e andamento](../../../Decis%C3%A3o%20Implementa%C3%A7%C3%B5es/PROG-016%20%E2%80%94%20Extens%C3%B5es%20%E2%80%94%20plano%20e%20andamento.md) | Contexto, achados, estado da entrega e próximos passos |
| [PROG-017 — Arquitetura e contratos](../../../Decis%C3%A3o%20Implementa%C3%A7%C3%B5es/PROG-017%20%E2%80%94%20Extens%C3%B5es%20%E2%80%94%20arquitetura%20e%20contratos.md) | Síntese das alternativas e desenho recomendado |
| [PROG-018 — Provas e sequência de entrega](../../../Decis%C3%A3o%20Implementa%C3%A7%C3%B5es/PROG-018%20%E2%80%94%20Extens%C3%B5es%20%E2%80%94%20provas%20e%20sequ%C3%AAncia%20de%20entrega.md) | Experimentos de viabilidade e jornadas planejadas em tela |
| [DEC-004 — Publicação, incidentes e métricas](../../../Decis%C3%A3o%20Implementa%C3%A7%C3%B5es/DEC-004%20%E2%80%94%20Extens%C3%B5es%20%E2%80%94%20publica%C3%A7%C3%A3o%2C%20incidentes%20e%20m%C3%A9tricas.md) | Escolhas de produto com alternativas, recomendação e espaço de resposta |

## Três investigações distintas e paralelas

| Frente | Responsabilidade |
|---|---|
| [1 — O que impacta](01-o-que-impacta.md) | Bases existentes que condicionam a nova plataforma: dados, acesso, eventos, agentes, navegação e distribuição |
| [2 — O que será impactado](02-o-que-sera-impactado.md) | Jornadas, componentes e compromissos que precisam continuar funcionando quando uma extensão entra, muda ou sai |
| [3 — O que pode impactar](03-o-que-pode-impactar.md) | Falhas futuras, dependências externas, alternativas de execução, compatibilidade, autenticidade e custo operacional |

Os relatórios foram produzidos por agentes distintos e reconciliados na síntese. Duas frentes também revisaram a proposta consolidada; as correções estão registradas na linha do tempo do PROG-016. Evidência de leitura não é prova de execução: **CONFIRMADO**, **INFERIDO** e **PROPOSTO** têm significados separados nos documentos.

## Escopo e preservação do trabalho existente

A pesquisa usa a branch `docs/plataforma-extensoes-20260914`, numa worktree própria. A pasta principal estava em outra branch, com alterações de outras sessões. Esses arquivos não foram incorporados nem revertidos. Os documentos solicitados ficam em `Decisão Implementações`; a branch da pesquisa preserva uma cópia versionada e as evidências técnicas.

O diagrama da proposta descreve responsabilidades futuras. Ele não foi publicado como mapa de componentes já operacionais, nem autoriza declarar a arquitetura implantada. Escolhas técnicas que dependem de medição permanecem explícitas no plano de provas.
