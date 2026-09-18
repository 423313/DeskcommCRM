# A agenda como aplicativo web — reestruturação de layout

> Spec de desenho. O pedido: "reestruturação de layout, principalmente na página da
> agenda, para visualização de aplicativo web… dá uma analisada como que está
> configurado o antigo sistema: ele é 100% mobile… existiam alguns ícones ali um
> pouco abaixo que eram alguns atalhos… tinha alguns que eram centrais da Flora,
> mas nesse caso aqui você pode colocar Inbox."

## 1. O que o sistema anterior fazia (medido, não lembrado)

Base: `C:\dev\CRM GERAL\crm-studio-mariana-castro\web`. Next 16, Tailwind 4,
ícones SVG escritos à mão (sem lucide, sem shadcn).

### 1.1 A barra de atalhos não era uma tab bar

`src/components/barra-inferior.tsx`. O engano fácil é copiar uma barra de cinco
destinos fixos. **Não é isso.** O primeiro item é sempre **Menu** (abre a gaveta);
os demais **mudam conforme a rota**, resolvidos por prefixo mais longo primeiro
(`ACOES_POR_ROTA`, `:130-235`):

| Rota | Itens depois de "Menu" |
|---|---|
| `/` | Agenda · **Flora** · Atualizar |
| `/agenda` | Mês · Criar |
| `/comandas`, `/clientes` | Filtros · Criar |
| `/financeiro` | Painel · Filtro · Transações |
| `/comissoes` | Pendentes · Pagas |

São **as ações da tela em que a pessoa está**, não as seções do produto. É a ideia
forte do legado, e é o que vale reproduzir.

Medidas: `fixed inset-x-3 bottom-3 z-40 rounded-[1.35rem] border bg-superficie/95
backdrop-blur shadow-suave md:hidden`, com `paddingBottom: env(safe-area-inset-bottom)`.
Ela **flutua** — 12px de respiro dos três lados, não colada no rodapé. Item:
`min-h-11 flex-1 flex-col gap-1 py-2.5 text-[11px]`, ícone 22×22, rótulo sempre
visível abaixo. Não há marcação de item ativo: a distinção é entre **neutro**
(Menu, Atualizar) e **ação** (Criar, Filtro), por cor. O `<main>` leva `pb-28`
no celular e `md:pb-10` — essa folga é o que impede a barra de tapar o conteúdo.

**O que não levar:** o item "Mês" do legado aponta para `visao=semana` (bug real,
`:334-346`); os alvos de toque de 30 min na grade têm 33px enquanto todo o resto
do app respeita 44px; e o primeiro dia da semana diverge entre as visões (mês
começa domingo, semana começa segunda).

### 1.2 As três visões, e a troca por URL

`?visao=mes`, `?visao=semana`, ausência = **dia**. A troca é `<Link>`, não estado
de cliente: o botão voltar do celular desfaz a troca de visão, e o link é
compartilhável.

- **Dia**: grade real. `PX_POR_MINUTO = 1.1` (`lib/agenda-grade.ts:7`) → slot de
  30 min = 33px, hora = 66px. Janela **elástica**: padrão 08:00–20:00, esticando
  com 60 min de folga quando há atendimento fora dela. Colunas por profissional,
  eixo de 56px, **coluna única vira `flex-1`** no celular (é o que faz a grade
  caber sem rolagem horizontal). Linha vermelha de "agora". Cada meia hora vazia
  é um link para criar, já com data, hora e profissional preenchidos.
- **Semana**: **não é grade**. É uma pilha de sete cartões, um por dia, com
  contagem à direita e os agendamentos em linhas de `text-xs`.
- **Mês**: `grid-cols-7`, dia como círculo de 44px (`h-11`), **a contagem de
  agendamentos em 9px logo abaixo do número**, feriado pintando a célula.

Cartão de agendamento: `absolute inset-x-1 rounded-lg border-l-4 px-2 py-1
text-[11px]`, altura proporcional à duração com piso de 20px, três linhas
(faixa de horário, cliente, serviço). Status por **fundo + borda esquerda de
4px**, nunca por ícone.

## 2. Onde o fork está hoje

- `app/app/agenda/_client.tsx` (1014) + `components/agenda/GradeDaAgenda.tsx` (1010).
- Três visões existem, mas em `useState` puro: **nada na URL**. Recarregar volta
  para semana; o botão voltar do celular sai da agenda em vez de desfazer.
- No celular a semana esconde 6 das 7 colunas com `max-md:hidden` — vira um "dia"
  disfarçado cujo botão de avançar pula sete dias. Um `useEffect` compensa
  forçando a visão dia na montagem.
- Grade: `ALTURA_DA_HORA = 48` (0,8px/min) e janela **fixa** 07h–21h. Agendamento
  fora dessa faixa não é desenhado (`GradeDaAgenda.tsx:443` devolve `null`) — some
  em silêncio.
- Mês: `grid-cols-7` cru, sempre 6 semanas, célula `min-h-20` — em 390px dá ~50px
  de largura com lista de eventos dentro.
- Shell: sidebar `hidden md:block`, hambúrguer no `TopBar`, `<main class="p-6">`.
  **Não existe barra inferior.** `viewport` exporta só `themeColor` — sem
  `viewportFit: "cover"`, e `env(safe-area-inset-*)` não aparece uma vez sequer
  em `app/` ou `components/`.

## 3. O desenho

### 3.1 Estado na URL (`?visao=` e `?data=`)

A agenda passa a ler e escrever `visao` e `data` na query, com `router.replace`
(a troca de visão não deve empilhar uma entrada por clique; a troca de **data**
também é `replace`, porque quem anda cinco dias não quer cinco voltas). O default
continua: sem `visao` na URL, celular abre em `dia` e desktop em `semana` — a
decisão de largura segue no `useEffect`, pelo mesmo motivo de hidratação que o
comentário atual registra.

Ganho concreto: o link da agenda de um dia vira algo que se manda no WhatsApp, e
o recarregar deixa de perder o lugar.

### 3.2 A semana no celular vira lista, como no legado

Esconder seis colunas é uma não-resposta: gasta o espaço da grade para mostrar um
dia. No lugar, abaixo de `md` a visão semana renderiza **sete cartões empilhados**
(`SemanaEmLista`), cada um com dia da semana, número, contagem e os agendamentos
em linha (hora · pessoa · tipo, ponto colorido com a trilha do responsável). Toque
no cartão do dia leva à visão dia daquele dia; toque no agendamento abre o detalhe.

Isso **substitui** a estratégia `max-md:hidden` da grade, e portanto reescreve
`components/agenda/GradeDaAgenda.mobile.test.tsx`. É deliberado: o teste prende o
desenho antigo, e o desenho antigo é o que está sendo trocado. O teste novo prende
a regra nova — na visão semana, abaixo de `md`, existem sete cartões de dia e
nenhuma coluna de grade.

### 3.3 O mês no celular vira calendário com contagem

Abaixo de `md`, a célula do mês deixa de listar eventos e passa a mostrar o dia
como círculo (`h-11 w-11`, 44px de alvo) com **a contagem de agendamentos** logo
abaixo, em 10px — exatamente o que o legado faz. Acima de `md`, a célula rica de
hoje permanece. Toque no dia leva à visão dia.

### 3.4 A grade do dia: janela elástica e hora mais alta no celular

Duas mudanças em `GradeDaAgenda.tsx`, as duas com o mesmo motivo (o que está fora
da janela hoje é invisível, não é rolável):

1. `PRIMEIRA_HORA`/`ULTIMA_HORA` deixam de ser constantes de módulo e passam a
   ser derivadas dos agendamentos desenhados: `min(7, primeiro − 1h)` e
   `max(21, último + 1h)`, limitadas a 0–24. Dia sem nada fora da faixa fica
   idêntico ao de hoje. Os exports `JANELA_DA_GRADE` e `ALTURA_DA_HORA_PX` são
   consumidos por testes e pela camada de interação, então a janela derivada é
   passada adiante em vez de lida do módulo.
2. `ALTURA_DA_HORA` vira valor do componente: **64px no celular** (30 min = 32px
   de alvo, contra 24px hoje) e 48px de `md` para cima. A largura decide, pelo
   mesmo `matchMedia` que já decide a visão inicial.

### 3.5 A barra de atalhos inferior

`components/shell/BarraInferior.tsx`, montada no `AppShell` depois do `<main>`,
`md:hidden`, flutuante como a do legado (`fixed inset-x-3 bottom-3 z-30
rounded-2xl border border-border bg-surface/95 backdrop-blur shadow-lg`,
`paddingBottom: env(safe-area-inset-bottom)`).

Primeiro item **sempre Menu**, abrindo a mesma gaveta do `MobileSidebar` (o
componente é fatiado para que o gatilho possa vir de fora, sem duplicar a
navegação). Os demais por prefixo de rota, **com Inbox no lugar da "central da
Flora"**, como pedido:

| Prefixo | Itens depois de Menu |
|---|---|
| `/app/agenda` | **Hoje** · **Visão** (dia › semana › mês, cíclico) · **Novo** |
| `/app/inbox` | **Agenda** · **Atualizar** |
| `/app/comandas` | **Inbox** · **Nova** |
| `/app/comissoes`, `/app/faturamento` | **Inbox** · **Período** |
| `/app/contacts` | **Inbox** · **Novo** |
| qualquer outra (inclusive `/app`) | **Inbox** · **Agenda** |

A fileira padrão é o que o legado tinha na home, com Inbox no lugar da Flora. As
ações que dependem de estado da página (Visão, Novo, Período) são publicadas pela
própria página num contexto leve (`AcoesDaBarraInferior`) — a barra não conhece a
agenda, e a agenda não conhece a barra. Rota sem ações publicadas cai na fileira
padrão, que é só navegação.

Item: `min-h-12 flex-1 flex-col gap-1 py-2 text-[11px]`, ícone Phosphor 22px,
rótulo sempre visível. Neutro em `text-text-muted`, ação em `text-accent`. Ativo
por rota **não** é marcado (a barra não é navegação primária; a gaveta é).

### 3.6 O respiro do conteúdo

- `<main>` passa de `p-6` a `p-4 pb-28 md:p-6 md:pb-10` — a folga de 112px é a
  medida do legado, e sem ela a barra tapa o fim de toda lista.
- `app/layout.tsx` ganha `width`, `initialScale` e **`viewportFit: "cover"`** no
  export de `viewport` — sem ele `env(safe-area-inset-bottom)` é sempre zero e a
  barra fica sob a barra de gestos do iPhone.
- A barra de controles da agenda (`flex-wrap` com filtro, setas e alternador)
  encolhe no celular: o alternador de visão sai da barra superior (vira a ação
  "Visão" do rodapé) e as setas ganham `h-11 w-11`.

### 3.7 O que a execução acrescentou (medido na tela, não previsto aqui)

Quatro coisas só apareceram com a tela de 390px na frente, e entraram:

1. **A ordem dos blocos no celular.** O cartão de conexão do Google ocupava um
   terço da primeira tela e o histórico vinha antes da agenda: a lista da
   semana nascia abaixo da dobra. No celular a agenda passa a ser o primeiro
   bloco (`order` no flex), o histórico vem depois e o aviso do Google por
   último. No desktop nada muda.
2. **Os chips de tipo rolam em uma linha.** Com 14 tipos, o `flex-wrap` gerava
   dez linhas de chips antes de a agenda começar. Vira fila rolável abaixo de
   `sm`, como a fila de profissionais do sistema anterior.
3. **A grade abre no primeiro compromisso.** Num dia cujo atendimento começa às
   11h, abrir às 07h mostra quatro horas vazias e o dia parece livre.
4. **A caixa da grade ganhou `max-h` no celular** — sem altura máxima quem rola
   é a página, a grade não tem rolagem interna, e o item 3 não teria efeito
   nenhum. Foi exatamente o que aconteceu na primeira tentativa.

## 4. O que fica de fora, deliberadamente

- **PWA instalável.** O manifest tem um ícone de 64px e nenhum maskable; fazer o
  Chrome oferecer "instalar" é trabalho de ícone e de service worker, não de
  layout, e o pedido foi de layout.
- **Gesto de arrastar entre dias.** O legado não tem (zero `onTouchStart` no
  código dele) e o arraste de card já usa `setPointerCapture` — competiriam.
- **Cor por status** no card. O fork colore por pessoa, e a cor por pessoa é o que
  o filtro de pessoas usa; trocar quebraria a leitura da grade multi-pessoa.
- **Bottom sheet com snap.** `SheetContent side="bottom"` existe e ninguém usa; o
  sheet lateral atual já ocupa a tela toda no celular.

## 5. Como se prova

1. `pnpm typecheck`, `pnpm lint`, `pnpm test:unit`.
2. `components/agenda/GradeDaAgenda.mobile.test.tsx` reescrito para a regra nova
   (semana abaixo de `md` = sete cartões, zero colunas).
3. Teste novo da janela elástica: agendamento às 06:30 **aparece** na grade (hoje
   some).
4. Teste novo da barra: a fileira de `/app/agenda` traz Hoje/Visão/Novo; a de rota
   desconhecida traz Inbox/Agenda; a barra não renderiza acima de `md`.
5. Playwright em 390×844 na `/app/agenda`, nas três visões, com o gate de estouro
   horizontal que as quatro specs de agenda já cobram — e screenshot de cada visão
   em `.superpowers/evidence/`.
6. `tests/e2e/navegacao.spec.ts` continua verde: a sidebar segue ausente em 390px
   e o hambúrguer do TopBar continua abrindo a gaveta.

## 5.1 Living System Checklist

Isto é reestruturação de layout, não peça nova de domínio — não há entrada, saída
nem registro de atividade a declarar. O que o checklist ainda cobra, e as respostas:

- **Tem porta na navegação?** A rota é a mesma (`/app/agenda`, já no `NAV_CATALOG`
  com `sidebar: true`). Nenhuma rota nova foi criada, então `navegacao-completude`
  não é tocado — confirmado verde.
- **Tem mecanismo anti-morte?** Três: `GradeDaAgenda.mobile.test.tsx` (a semana em
  lista e a janela elástica), `BarraInferior.test.tsx` (o Menu fixo, a fileira
  padrão, a ação que vence a navegação) e o roteiro de tela
  `.superpowers/evidence/prova-agenda-mobile.mjs`, com 22 asserções em 390px.
- **Qual é o laço de retorno quando erra?** O gate de estouro horizontal, que já
  roda em quatro specs de agenda e nomeia o elemento culpado. Uma barra ou grade
  que passe da largura reprova ali, não em produção.

## 6. Onde pode falhar

1. **A barra `fixed` estoura a largura** e reprova o gate de overflow em quatro
   specs. `inset-x-3` mais `min-w-0` nos itens é o que previne; a mensagem de erro
   nomeia o elemento culpado.
2. **A janela elástica muda `JANELA_DA_GRADE`**, que é export consumido por teste
   e pela camada de arraste (`limites`). Derivar sem repassar deixaria o arraste
   calculando contra uma janela que a grade não desenha mais.
3. **O `ActiveCallPanel` é `fixed bottom-4 right-4 z-50`** e vai brigar por espaço
   com a barra. Ele fica por cima (z maior), que é o comportamento certo — uma
   chamada em curso vence um atalho —, mas precisa subir para não cobrir o último
   item.
4. **Publicar ação de página por contexto** cria a tentação de a barra saber da
   agenda. O contexto guarda `{icone, rotulo, aoTocar}`, nada mais.
