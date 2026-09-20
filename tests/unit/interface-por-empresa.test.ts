/**
 * Portas por EMPRESA (issue #1341, migration 0367).
 *
 * A escolha por vínculo (0221) é a PESSOA. O que faltava era a escolha da
 * ORGANIZAÇÃO — o universo da instalação, um degrau acima. Estes casos fixam as
 * duas propriedades que fazem o degrau existir sem virar autorização:
 *
 *  1. a leitura resolve EMPRESA ∩ VÍNCULO ∩ papel — nenhum dos dois lados abre o
 *     que o outro fechou, e o papel continua decidindo por cima dos dois;
 *  2. a combinação nunca devolve um conjunto vazio: sem interseção sobram as
 *     portas essenciais, porque `destinos: []` é recusado pelo schema e valor
 *     recusado vira interface COMPLETA em `lerInterface` — falha ABERTA, o
 *     oposto do que se quer de uma configuração de menu.
 *
 * O último bloco MEDE a resposta da pergunta de aceite: quantos itens o menu
 * lateral tem hoje e quantos sobram por configuração escolhida. Os números são
 * de MÓDULO (a projeção que o menu consome), não de tela: o instrumento de tela
 * é `tests/e2e/navegacao.spec.ts:222`, que segue intacto.
 */
import { describe, expect, it } from "vitest";

import { NAV_CATALOG } from "@/lib/navigation/catalogo";
import {
  combinarInterfaces,
  destinosDaInterface,
  essencial,
  interfaceSettingsSchema,
  interfaceTemDestino,
  INTERFACE_COMPLETA,
  lerInterface,
  type InterfaceSettings,
} from "@/lib/navigation/interface";
import { GRUPO_NO_RODAPE, sidebarGroups } from "@/lib/navigation/registry";

const completa = { preset: "completa" } as const;
const simplificada = { preset: "simplificada" } as const;

const hrefs = (settings: unknown, role: "agent" | "admin" = "admin") =>
  destinosDaInterface(settings, false, role).map((d) => d.href);

/**
 * Os itens do MENU LATERAL — o mesmo recorte que o instrumento de tela mede:
 * só os grupos que aparecem na dobra, sem o grupo do rodapé.
 */
const itensNoMenuLateral = (settings: unknown, role: "agent" | "admin" = "admin") =>
  sidebarGroups(false, role, settings as InterfaceSettings | null)
    .filter((grupo) => grupo.group.id !== GRUPO_NO_RODAPE)
    .reduce((total, grupo) => total + grupo.items.length, 0);

const essenciais = (role: "agent" | "admin" = "admin") =>
  NAV_CATALOG.filter((d) => essencial(d, role)).map((d) => d.href);

describe("portas por empresa (issue #1341)", () => {
  it("sem escolha de nenhum dos lados nada muda: a empresa completa segue completa", () => {
    expect(combinarInterfaces(completa, completa)).toEqual(INTERFACE_COMPLETA);
    expect(combinarInterfaces(undefined, null).destinos).toBeUndefined();
    expect(hrefs(combinarInterfaces(completa, completa))).toEqual(NAV_CATALOG.map((d) => d.href));
  });

  it("o vínculo NÃO abre porta que a empresa não oferece", () => {
    // A empresa oferece um punhado; o vínculo pede tudo. Vale o que a empresa
    // ofereceu — antes desta mudança o vínculo vencia sempre.
    const daEmpresa = { preset: "completa", destinos: ["/app/inbox", "/app/contacts"] } as const;
    const resultado = hrefs(combinarInterfaces(daEmpresa, completa));
    expect(resultado).toContain("/app/inbox");
    expect(resultado).toContain("/app/contacts");
    expect(resultado).not.toContain("/app/products");
    expect(resultado).not.toContain("/app/ai/agents");
  });

  it("o vínculo estreita DENTRO da empresa, e nunca além dela", () => {
    const daEmpresa = {
      preset: "completa",
      destinos: ["/app/inbox", "/app/contacts", "/app/products", "/app/ai/agents"],
    } as const;
    const doVinculo = { preset: "completa", destinos: ["/app/inbox", "/app/products"] } as const;
    expect(hrefs(combinarInterfaces(daEmpresa, doVinculo)).sort()).toEqual(
      [...essenciais(), "/app/inbox", "/app/products"].sort(),
    );
  });

  it("empresa simplificada estreita o vínculo completo (o limite vale dos dois lados)", () => {
    const soEmpresa = hrefs(combinarInterfaces(simplificada, completa));
    expect(soEmpresa).toEqual(hrefs(simplificada));
    expect(soEmpresa).not.toContain("/app/products");
  });

  it("sem interseção sobram as essenciais — nunca `destinos: []` (seria falha ABERTA)", () => {
    // `destinos: []` é recusado pelo schema, e valor recusado vira interface
    // COMPLETA: se a combinação devolvesse lista vazia, a escolha da empresa se
    // transformaria em "mostre tudo". Por isso o piso é o conjunto essencial.
    expect(interfaceSettingsSchema.safeParse({ preset: "completa", destinos: [] }).success).toBe(
      false,
    );
    const daEmpresa = { preset: "completa", destinos: ["/app/inbox"] } as const;
    const doVinculo = { preset: "completa", destinos: ["/app/products"] } as const;
    const resultado = combinarInterfaces(daEmpresa, doVinculo);
    expect(resultado.destinos).not.toEqual([]);
    expect(interfaceSettingsSchema.safeParse(resultado).success).toBe(true);
    expect(lerInterface(resultado).settings.destinos).toEqual(resultado.destinos);
    expect(hrefs(resultado).sort()).toEqual(essenciais().sort());
  });

  it("o PAPEL continua mandando por cima das duas escolhas (controle negativo)", () => {
    const paraAgente = hrefs(combinarInterfaces(completa, completa), "agent");
    const paraAdmin = hrefs(combinarInterfaces(completa, completa));
    // a área administrativa da organização não entra para quem é agente...
    expect(paraAgente).not.toContain("/app/settings/tenant");
    // ...e marcar essa porta na escolha da EMPRESA não promove ninguém
    const comAdminMarcado = combinarInterfaces(
      { preset: "completa", destinos: ["/app/settings/tenant", "/app/inbox"] },
      completa,
    );
    expect(hrefs(comAdminMarcado, "agent")).not.toContain("/app/settings/tenant");
    // o papel só tira: o conjunto do agente é estritamente menor que o do admin
    expect(paraAgente.length).toBeLessThan(paraAdmin.length);
    expect(paraAgente.every((href) => paraAdmin.includes(href))).toBe(true);
  });
});

describe("medição da folga (pergunta de aceite da issue #1341)", () => {
  /**
   * Baseline: a configuração de HOJE — nenhuma escolha, nem da empresa nem do
   * vínculo. É o número que o issue publica (15 itens: atendimento 4, CRM 3,
   * IA 3, canais 2, análise 3), medido aqui pelo módulo que alimenta o menu.
   */
  it("hoje: 15 itens no menu lateral, folga 0 (é o teto da dobra a 1280x900)", () => {
    expect(itensNoMenuLateral(INTERFACE_COMPLETA)).toBe(15);
    // `undefined` é o caminho de quem não tem escolha nenhuma gravada
    expect(itensNoMenuLateral(undefined)).toBe(15);
  });

  /**
   * Depois: a folga deixa de ser um número único e passa a ser escolhida.
   * A escolha da empresa é interseção, então o menu só ENCOLHE — a mudança não
   * tem como empurrar o instrumento de tela para o vermelho.
   */
  it("configuração COMPLETA (ninguém escolheu): 15 itens, folga 0 — igual a hoje", () => {
    expect(itensNoMenuLateral(combinarInterfaces(completa, completa))).toBe(15);
  });

  it("configuração SIMPLIFICADA (empresa escolhe o preset): 6 itens, folga 9", () => {
    const itens = itensNoMenuLateral(combinarInterfaces(simplificada, completa));
    expect(itens).toBe(6);
    expect(15 - itens).toBe(9);
  });

  it("configuração MÍNIMA (empresa escolhe 1 porta): 1 item, folga 14", () => {
    const minima = combinarInterfaces({ preset: "completa", destinos: ["/app/inbox"] }, completa);
    expect(interfaceTemDestino(minima, "admin")).toBe(true); // a guarda exige ≥1 porta
    const itens = itensNoMenuLateral(minima);
    expect(itens).toBe(1);
    expect(15 - itens).toBe(14);
  });

  it("nenhuma escolha da empresa pode AUMENTAR o menu (é interseção, não soma)", () => {
    const casos: unknown[] = [
      simplificada,
      { preset: "completa", destinos: ["/app/inbox"] },
      { preset: "completa", destinos: ["/app/inbox", "/app/contacts", "/app/products"] },
      { preset: "completa", destinos: essenciais() },
    ];
    for (const daEmpresa of casos) {
      for (const doVinculo of [completa, simplificada, undefined]) {
        expect(itensNoMenuLateral(combinarInterfaces(daEmpresa, doVinculo))).toBeLessThanOrEqual(15);
      }
    }
  });
});
