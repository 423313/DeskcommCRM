"use client";
/**
 * O canal por onde uma TELA empresta suas ações à barra de atalhos do celular.
 *
 * A barra existe no shell e a ação mora na página: "Novo agendamento" depende
 * do sheet de marcação, que é estado do cliente da agenda. Sem um canal, ou a
 * barra passa a conhecer a agenda (e depois as comandas, e depois o inbox), ou
 * cada tela desenha a própria barra e elas se empilham.
 *
 * Duas decisões que este arquivo existe para sustentar:
 *
 *  1. **O que trafega é DESCRIÇÃO, não JSX**: id, rótulo, nome do ícone e tom.
 *     A função fica de fora do estado, e assim a assinatura do que foi
 *     publicado é texto puro — o efeito que publica não reage à identidade
 *     nova que todo render de React dá a um array literal. Publicar num efeito
 *     cujo dependente é um array recriado a cada passagem é laço infinito, e é
 *     o modo de falha que este desenho evita.
 *  2. **Quem guarda as funções é o PROVEDOR**, e a tela as entrega por uma
 *     função de registro. A ref é criada onde é escrita: uma ref recebida por
 *     contexto é de outro componente, e escrever nela é o que o compilador do
 *     React recusa ("This value cannot be modified").
 */
import * as React from "react";

export type TomDaAcao = "neutro" | "acao";

export interface AcaoDaBarra {
  id: string;
  rotulo: string;
  /** Nome no mapa de `BarraInferior`. String, não componente: precisa ser comparável. */
  icone: string;
  tom?: TomDaAcao;
  aoTocar: () => void;
}

export type AcaoPublicada = Omit<AcaoDaBarra, "aoTocar">;

interface Canal {
  itens: AcaoPublicada[];
  /** Dispara a ação por id, na versão mais recente que a tela registrou. */
  disparar: (id: string) => void;
  publicar: (itens: AcaoPublicada[]) => void;
  registrar: (mapa: Record<string, () => void>) => void;
}

const Contexto = React.createContext<Canal | null>(null);

export function ProvedorDeAcoesDaBarra({ children }: { children: React.ReactNode }) {
  const [itens, setItens] = React.useState<AcaoPublicada[]>([]);
  const funcoes = React.useRef<Record<string, () => void>>({});

  const registrar = React.useCallback((mapa: Record<string, () => void>) => {
    funcoes.current = mapa;
  }, []);
  const disparar = React.useCallback((id: string) => {
    funcoes.current[id]?.();
  }, []);

  const valor = React.useMemo<Canal>(
    () => ({ itens, disparar, publicar: setItens, registrar }),
    [itens, disparar, registrar],
  );
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

/** Lido pela barra. Fora do provedor devolve vazio, e a barra cai na fileira padrão. */
export function useAcoesPublicadas(): { itens: AcaoPublicada[]; disparar: (id: string) => void } {
  const ctx = React.useContext(Contexto);
  const nada = React.useCallback(() => {}, []);
  return ctx ? { itens: ctx.itens, disparar: ctx.disparar } : { itens: [], disparar: nada };
}

/**
 * Usado pela TELA. As ações somem quando ela sai — a barra volta sozinha para a
 * fileira de navegação, sem a tela precisar limpar nada.
 */
export function usePublicarAcoesDaBarra(acoes: AcaoDaBarra[]): void {
  const ctx = React.useContext(Contexto);
  const publicar = ctx?.publicar;
  const registrar = ctx?.registrar;

  // Sem lista de dependências: as funções são regravadas a cada passagem, para
  // a barra sempre chamar a versão atual. Trocar de callback não republica.
  React.useEffect(() => {
    if (!registrar) return;
    const mapa: Record<string, () => void> = {};
    for (const a of acoes) mapa[a.id] = a.aoTocar;
    registrar(mapa);
  });

  const assinatura = JSON.stringify(
    acoes.map(({ id, rotulo, icone, tom }) => ({ id, rotulo, icone, tom })),
  );

  React.useEffect(() => {
    if (!publicar) return;
    publicar(JSON.parse(assinatura) as AcaoPublicada[]);
    return () => publicar([]);
  }, [assinatura, publicar]);
}
