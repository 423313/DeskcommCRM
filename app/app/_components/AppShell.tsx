"use client";
import { useState, type ReactNode } from "react";
import { BarraInferior } from "@/components/shell/BarraInferior";
import { ProvedorDeAcoesDaBarra } from "@/components/shell/acoes-da-barra-inferior";
import { GavetaDeNavegacao } from "@/components/shell/MobileSidebar";
import { Sidebar } from "@/components/shell/Sidebar";
import { TopBar } from "@/components/shell/TopBar";
import { BarraDeProgressoNavegacao } from "@/components/shell/BarraDeProgressoNavegacao";
import { useSinalDePresenca } from "@/hooks/atendimento/useSinalDePresenca";
import { useInboundMessageAlerts } from "@/hooks/notifications/useInboundMessageAlerts";
import { useCrmAlerts } from "@/hooks/notifications/useCrmAlerts";
import { useNotifyOpenFromServiceWorker } from "@/lib/notifications/notify_open";

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
  useCrmAlerts();
  useNotifyOpenFromServiceWorker();
  // O SINAL DE PRESENÇA (issue #996) sai daqui porque presença é "esta aba
  // está aberta" — não "a pessoa está na tela Equipe". Quem atende passa o dia
  // no Inbox e na Agenda; um emissor amarrado à tela de gestão diria que só o
  // gerente está presente.
  useSinalDePresenca(podeAtender);
  const [menuAberto, setMenuAberto] = useState(false);
  return (
    <ProvedorDeAcoesDaBarra>
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
          `pb-28` no celular é a folga que a barra de atalhos flutuante exige:
          sem ela a barra fica POR CIMA do fim de toda lista, e o último item de
          qualquer tela é inalcançável — o pior tipo de defeito de layout,
          porque a tela parece inteira. `p-4` em vez de `p-6` pelo mesmo motivo
          de tela pequena: 24px de cada lado somados ao respiro dos cartões não
          deixam largura para conteúdo em 390px.
        */}
          <main className="flex-1 overflow-auto p-4 pb-28 md:p-6 md:pb-10">{children}</main>
        </div>
        <BarraInferior aoAbrirMenu={() => setMenuAberto(true)} />
        <GavetaDeNavegacao aberta={menuAberto} onAbertaChange={setMenuAberto} />
      </div>
    </ProvedorDeAcoesDaBarra>
  );
}
