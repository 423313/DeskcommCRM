"use client";
import { Suspense, type ReactNode } from "react";
import { Sidebar } from "@/components/shell/Sidebar";
import { TopBar } from "@/components/shell/TopBar";
import { BarraDeProgressoNavegacao } from "@/components/shell/BarraDeProgressoNavegacao";
import { useSinalDePresenca } from "@/hooks/atendimento/useSinalDePresenca";
import { useInboundMessageAlerts } from "@/hooks/notifications/useInboundMessageAlerts";
import { useInboundCallAlerts } from "@/hooks/calls/useInboundCallAlerts";
import { useCrmAlerts } from "@/hooks/notifications/useCrmAlerts";
import { useNotifyOpenFromServiceWorker } from "@/lib/notifications/notify_open";
import { FloatingInbox } from "@/components/inbox/FloatingInbox";
import { estiloDaReserva, useOcupacaoDoRodape } from "@/lib/ui/rodape-ocupado";

interface AppShellProps {
  sidebarCollapsed: boolean;
  /**
   * A pessoa pode atender (agent+)? Vem do papel resolvido no layout, e não de
   * uma consulta desta casca.
   *
   * Só quem atende emite o sinal de presença: o roster que a tela Equipe mostra
   * é agent+, e a rota do sinal exige o mesmo papel. `viewer` batendo colheria
   * 403 a cada minuto em nome de ninguém.
   */
  podeAtender: boolean;
  children: ReactNode;
}

export function AppShell({ sidebarCollapsed, podeAtender, children }: AppShellProps) {
  useInboundMessageAlerts();
  useInboundCallAlerts();
  useCrmAlerts();
  useNotifyOpenFromServiceWorker();
  // O SINAL DE PRESENÇA (issue #996) sai daqui porque presença é "esta aba
  // está aberta" — não "a pessoa está na tela Equipe". Quem atende passa o dia
  // no Inbox e na Agenda; um emissor amarrado à tela de gestão diria que só o
  // gerente está presente.
  useSinalDePresenca(podeAtender);
  // O que as peças fixas do rodapé declararam ocupar agora (issue #1305). Sem
  // chamada nenhuma é ZERO, e aí o `<main>` fica exatamente como sempre foi —
  // o `p-6` inteiro é rodapé. Com o painel de chamada na tela, é ele que
  // decide a faixa que o conteúdo perde, e ninguém mais mede isso por fora.
  const ocupacaoDoRodape = useOcupacaoDoRodape();
  return (
    <div className="flex min-h-screen w-full bg-background">
      <BarraDeProgressoNavegacao />
      <div className="hidden md:block">
        <Sidebar collapsed={sidebarCollapsed} />
      </div>
      {/*
        `min-w-0` é o que permite a coluna de conteúdo ENCOLHER. Um flex item
        nasce com `min-width: auto`, ou seja, nunca fica menor que o conteúdo —
        então qualquer bloco largo (uma fila de abas, uma tabela) empurrava a
        PÁGINA INTEIRA para o lado em vez de rolar dentro da própria caixa, e o
        conteúdo sumia sem nada indicando que existia.

        Medido em 390x844 no detalhe do agente, que tem seis abas: a página
        estourava 476px na horizontal; com esta classe, 212px — o que sobra é o
        cabeçalho, presente também em telas que não têm abas (a lista de agentes
        estoura 236px). Isolado ancestral por ancestral: é este o que decide.
      */}
      {/*
        Sem `md:ml-*`: a barra voltou a ocupar lugar na linha (ver o comentário
        em `Sidebar.tsx`), então o que sobra para esta coluna é exatamente o que
        ela não usou. A margem existia para compensar uma barra `fixed`, e era a
        SEGUNDA medida da mesma coisa — a que discordava e deixava a barra por
        cima da lista.
      */}
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <TopBar />
        {/*
          O RODAPÉ DESCONTA O QUE AS PEÇAS FIXAS OCUPAM (issue #1305).

          `estiloDaReserva` devolve `undefined` quando não há peça registrada —
          nenhum estilo, o `p-6` de sempre —, e um `padding-bottom` que consome
          `--rodape-ocupado` quando há. O que ele descontou está também no
          atributo `data-rodape-ocupado`: é por ali que o gate mede esta faixa
          sem depender de o jsdom computar `var()` (ele não computa), e é o que
          aparece no inspetor quando alguém pergunta quanto o rodapé perdeu.
        */}
        <main
          className="flex-1 overflow-auto p-6"
          style={estiloDaReserva(ocupacaoDoRodape)}
          data-rodape-ocupado={ocupacaoDoRodape}
        >
          {children}
        </main>
      </div>
      {/*
        O ATALHO VIVE NO PRÓPRIO BOUNDARY DE SUSPENSE — e o porquê aqui está
        HONESTO, não bonito: o conserto pode estar funcionando por acidente.

        O QUE ESTÁ MEDIDO. Montar este atalho fazia SEIS testids de telas
        diferentes resolverem a dois elementos no e2e. Desligar a tag zerou os
        seis no mesmo job (105 casos rodando); pôr este boundary levou de seis
        para um. A ablação é prova por diferença; o resto abaixo não é.

        O QUE O SEGUNDO NÓ É, medido no trace: `<div hidden id="S:0">` — filho
        DIRETO do `<body>`, FORA desta árvore, com uma cópia inteira da página
        dentro. É o BUFFER DE STREAMING do SSR do React. Num stream correto,
        todo `id="S:N"` tem um `$RC("B:N","S:N")` que o revela e DRENA a caixa;
        no HTML gravado, o documento fecha sem nunca emitir esse `$RC`
        (conferido: `S:0` presente, `B:0` presente, `$RC` = ZERO). A caixa fica
        pendurada no `<body>` para sempre, e todo `getByTestId` casa dois.

        O ancestral comum dos dois nós é o `<body>`, não o `<main>`.

        POR QUE ESTA TAG É O GATILHO: ela renderiza INLINE, como irmã do
        `<main>`, e é a única coisa que escreve estado compartilhado da casca
        durante a hidratação (`usePecaDoRodape`) — o que faz o cliente preencher
        o `<main>` ANTES do reveal que drenaria a caixa.

        POR QUE O BOUNDARY PODE ESTAR ACERTANDO SEM QUE EU SAIBA: ele muda
        QUANDO o boundary resolve, e isso pode drenar o `#S:0`. Mas nada aqui
        suspende de verdade na montagem — não há `useSuspenseQuery` em lugar
        nenhum, e os dois `dynamic()` só renderizam dentro de
        `CompactConversation`, que exige `selected` truthy (nasce `null`).

        UMA EXPLICAÇÃO QUE ESTE COMENTÁRIO JÁ DEU E QUE ESTÁ FALSIFICADA: que o
        App Router "segurava a página anterior enquanto resolvia". Isso seria
        transição de CLIENTE, e os seis sítios são carga de DOCUMENTO
        (`page.goto`/`page.reload`) — não há página anterior para segurar.

        O experimento que fecha, e que ainda NÃO foi feito: carregar a tela com
        `javaScriptEnabled: false`. Dois nós sem JS = o servidor mandou dois, e
        a hidratação não tem parte nisso; um sem e dois com = a janela fecha em
        torno da hidratação.
      */}
      <Suspense fallback={null}>
        <FloatingInbox />
      </Suspense>
    </div>
  );
}
