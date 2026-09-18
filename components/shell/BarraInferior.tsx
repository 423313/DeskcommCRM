"use client";
/**
 * A barra de atalhos do celular.
 *
 * Copiada em ESPÍRITO do sistema que a dona do Studio usava, e a parte que
 * importa é a que se copia errado com facilidade: **não é uma tab bar de cinco
 * destinos fixos**. O primeiro item é sempre o Menu, e os demais são as AÇÕES
 * DA TELA em que a pessoa está — em Agenda são Hoje/Visão/Novo, em Comandas é
 * Nova. Uma barra de destinos fixos duplicaria a gaveta e não pouparia toque
 * nenhum.
 *
 * Duas escolhas de forma vêm de lá, e as duas têm motivo:
 *
 *  - Ela FLUTUA (`inset-x-3 bottom-3`, cantos arredondados) em vez de colar no
 *    rodapé. Colada, ela encosta na barra de gestos do iPhone e o toque no
 *    último item vira o gesto de "voltar à tela inicial".
 *  - `env(safe-area-inset-bottom)` no padding, que só vale alguma coisa porque
 *    `app/layout.tsx` declara `viewportFit: "cover"`.
 *
 * Ela não marca item ativo por rota, de propósito: navegação primária é a
 * gaveta, e um "ativo" aqui competiria com o que a gaveta já destaca.
 */
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";

import { useT } from "@/hooks/i18n/useT";
import {
  ArrowsClockwise,
  CalendarBlank,
  CalendarDots,
  Funnel,
  House,
  Inbox,
  List,
  Plus,
} from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

import { useAcoesPublicadas } from "./acoes-da-barra-inferior";

/**
 * Ícone por NOME. A tela publica `"Plus"`, não um componente: o que atravessa o
 * contexto precisa ser comparável para o efeito de publicação não republicar a
 * cada render.
 */
const ICONES: Record<
  string,
  React.ComponentType<{ size?: number; weight?: "bold" | "regular" }>
> = {
  ArrowsClockwise,
  CalendarBlank,
  CalendarDots,
  Funnel,
  House,
  Inbox,
  List,
  Plus,
};

interface ItemDeNavegacao {
  id: string;
  rotulo: string;
  icone: string;
  href: string;
}

/**
 * A fileira de quem não publicou ação nenhuma.
 *
 * No sistema anterior os dois atalhos da tela inicial eram Agenda e a central
 * do robô de WhatsApp. O robô sai de cena neste produto; quem ocupa o lugar é o
 * Inbox, que é onde a conversa realmente chega.
 */
const PADRAO: ItemDeNavegacao[] = [
  { id: "inbox", rotulo: "Inbox", icone: "Inbox", href: "/app/inbox" },
  { id: "agenda", rotulo: "Agenda", icone: "CalendarBlank", href: "/app/agenda" },
];

/** Navegação por prefixo, do mais longo para o mais curto. Sem entrada, cai no PADRÃO. */
const POR_ROTA: { prefixo: string; itens: ItemDeNavegacao[] }[] = [
  {
    prefixo: "/app/inbox",
    itens: [
      { id: "agenda", rotulo: "Agenda", icone: "CalendarBlank", href: "/app/agenda" },
      { id: "inicio", rotulo: "Início", icone: "House", href: "/app" },
    ],
  },
  {
    prefixo: "/app/agenda",
    itens: [{ id: "inbox", rotulo: "Inbox", icone: "Inbox", href: "/app/inbox" }],
  },
];

function navegacaoDe(pathname: string): ItemDeNavegacao[] {
  const achado = [...POR_ROTA]
    .sort((a, b) => b.prefixo.length - a.prefixo.length)
    .find((r) => pathname.startsWith(r.prefixo));
  return achado?.itens ?? PADRAO;
}

const ITEM =
  "flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium transition-colors duration-fast ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent-500";

function Icone({ nome }: { nome: string }) {
  const Componente = ICONES[nome] ?? CalendarDots;
  return (
    <span className="flex h-[22px] w-[22px] items-center justify-center" aria-hidden>
      <Componente size={22} />
    </span>
  );
}

export function BarraInferior({ aoAbrirMenu }: { aoAbrirMenu: () => void }) {
  const t = useT();
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const { itens: acoes, disparar } = useAcoesPublicadas();

  // As ações da tela VENCEM a navegação: quem está na agenda quer "Novo", não
  // um atalho para a agenda em que já está.
  const navegacao = acoes.length > 0 ? [] : navegacaoDe(pathname);

  return (
    <nav
      data-testid="barra-inferior"
      aria-label={t("Atalhos")}
      className={cn(
        "fixed inset-x-3 bottom-3 z-30 flex overflow-hidden rounded-2xl border border-border",
        "bg-surface/95 shadow-lg backdrop-blur md:hidden",
      )}
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <button
        type="button"
        data-testid="barra-menu"
        aria-label={t("Abrir navegação")}
        className={cn(ITEM, "text-text-muted hover:text-text")}
        onClick={aoAbrirMenu}
      >
        <Icone nome="List" />
        <span className="truncate">{t("Menu")}</span>
      </button>

      {navegacao.map((item) => (
        <button
          key={item.id}
          type="button"
          data-testid={`barra-${item.id}`}
          className={cn(ITEM, "text-text-muted hover:text-text")}
          onClick={() => router.push(item.href)}
        >
          <Icone nome={item.icone} />
          <span className="truncate">{t(item.rotulo)}</span>
        </button>
      ))}

      {acoes.map((acao) => (
        <button
          key={acao.id}
          type="button"
          data-testid={`barra-${acao.id}`}
          className={cn(
            ITEM,
            acao.tom === "acao" ? "text-accent" : "text-text-muted hover:text-text",
          )}
          onClick={() => disparar(acao.id)}
        >
          <Icone nome={acao.icone} />
          <span className="truncate">{t(acao.rotulo)}</span>
        </button>
      ))}
    </nav>
  );
}
