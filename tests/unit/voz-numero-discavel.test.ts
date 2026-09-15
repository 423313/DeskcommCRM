/**
 * O NÚMERO QUE A LIGAÇÃO DISCA — perguntado ao WhatsApp, não adivinhado.
 *
 * Medido na VPS em 2026-09-15: o contato `+5531998966398` foi discado como
 * `5531998966398@s.whatsapp.net`, e o WhatsApp o registra como `553198966398`.
 * O WAHA respondeu `check-exists` das DUAS grafias com
 * `{"numberExists":true,"chatId":"553198966398@c.us"}` — é essa resposta,
 * copiada do terminal, que os casos abaixo usam. Ver `lib/voice/numero-discavel.ts`.
 */
import { describe, expect, it, vi } from "vitest";

import type { WahaClient } from "@/lib/waha/client";
import { phoneJidDigitsFromCheckResult } from "@/lib/waha/resolve-contact-whatsapp-id";
import { resolverNumeroDiscavel } from "@/lib/voice/numero-discavel";

const ORG = "11111111-1111-4111-8111-111111111111";
const RESPOSTA_MEDIDA = { numberExists: true, chatId: "553198966398@c.us" };

function supabaseCom(sessao: string | null) {
  const filtros: Array<[string, unknown]> = [];
  const cadeia: Record<string, unknown> = {};
  for (const m of ["select", "limit"]) cadeia[m] = () => cadeia;
  cadeia.eq = (c: string, v: unknown) => (filtros.push([c, v]), cadeia);
  cadeia.is = (c: string, v: unknown) => (filtros.push([c, v]), cadeia);
  cadeia.not = () => cadeia;
  cadeia.maybeSingle = async () => ({
    data: sessao ? { waha_session_name: sessao } : null,
    error: null,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { db: { from: () => cadeia } as any, filtros };
}

function wahaQueResponde(respostas: Record<string, unknown>) {
  const perguntas: string[] = [];
  const cliente = {
    checkContactExists: vi.fn(async (_sessao: string, digitos: string) => {
      perguntas.push(digitos);
      const r = respostas[digitos];
      if (r instanceof Error) throw r;
      return r ?? { numberExists: false };
    }),
  } as unknown as WahaClient;
  return { cliente, perguntas };
}

describe("phoneJidDigitsFromCheckResult — só endereço de TELEFONE serve para ligar", () => {
  it("c.us e s.whatsapp.net viram dígitos; o sufixo de aparelho sai", () => {
    expect(phoneJidDigitsFromCheckResult(RESPOSTA_MEDIDA)).toBe("553198966398");
    expect(
      phoneJidDigitsFromCheckResult({ numberExists: true, chatId: "553198966398:12@s.whatsapp.net" }),
    ).toBe("553198966398");
  });

  it("@lid sozinho NÃO serve: o WaCalls transformaria os dígitos do lid num telefone inexistente", () => {
    expect(phoneJidDigitsFromCheckResult({ numberExists: true, chatId: "59782320914646@lid" })).toBeNull();
  });

  it("com lid no chatId e telefone no pn, vale o pn", () => {
    expect(
      phoneJidDigitsFromCheckResult({
        numberExists: true,
        chatId: "59782320914646@lid",
        pn: "553198966398@c.us",
      }),
    ).toBe("553198966398");
  });

  it("número que não existe não devolve nada", () => {
    expect(phoneJidDigitsFromCheckResult({ numberExists: false, chatId: "553198966398@c.us" })).toBeNull();
  });
});

describe("resolverNumeroDiscavel", () => {
  it("o caso medido: cadastro COM o nono, WhatsApp SEM — disca o do WhatsApp", async () => {
    const { db, filtros } = supabaseCom("org_988371bf_8a08b2");
    const { cliente } = wahaQueResponde({ "5531998966398": RESPOSTA_MEDIDA });

    const r = await resolverNumeroDiscavel(db, ORG, "+5531998966398", { waha: () => cliente });

    expect(r).toEqual({ digitos: "553198966398", fonte: "whatsapp" });
    // A sessão consultada é de mensagens, em pé, desta organização.
    expect(filtros).toEqual(
      expect.arrayContaining([
        ["organization_id", ORG],
        ["provider", "waha"],
        ["status", "WORKING"],
      ]),
    );
  });

  it("a primeira grafia não existe e a segunda existe: pergunta as duas", async () => {
    const { db } = supabaseCom("sessao");
    const { cliente, perguntas } = wahaQueResponde({ "553198966398": RESPOSTA_MEDIDA });

    const r = await resolverNumeroDiscavel(db, ORG, "+5531998966398", { waha: () => cliente });

    expect(perguntas).toEqual(["5531998966398", "553198966398"]);
    expect(r.digitos).toBe("553198966398");
  });

  it("sem WAHA na instalação, disca o cadastro — o comportamento de antes, sem recusar", async () => {
    const { db } = supabaseCom("sessao");
    const r = await resolverNumeroDiscavel(db, ORG, "+5531998966398", { waha: () => null });
    expect(r).toEqual({ digitos: "5531998966398", fonte: "cadastro" });
  });

  it("sem sessão de mensagens em pé, disca o cadastro sem perguntar a ninguém", async () => {
    const { db } = supabaseCom(null);
    const { cliente, perguntas } = wahaQueResponde({ "5531998966398": RESPOSTA_MEDIDA });
    const r = await resolverNumeroDiscavel(db, ORG, "+5531998966398", { waha: () => cliente });
    expect(r.fonte).toBe("cadastro");
    expect(perguntas).toEqual([]);
  });

  it("consulta que falha ou só devolve @lid cai no cadastro", async () => {
    const { db } = supabaseCom("sessao");
    const falha = wahaQueResponde({
      "5531998966398": new Error("waha_500"),
      "553198966398": new Error("waha_500"),
    });
    expect((await resolverNumeroDiscavel(db, ORG, "+5531998966398", { waha: () => falha.cliente })).fonte).toBe(
      "cadastro",
    );
    const soLid = wahaQueResponde({ "5531998966398": { numberExists: true, chatId: "59782320914646@lid" } });
    expect(await resolverNumeroDiscavel(db, ORG, "+5531998966398", { waha: () => soLid.cliente })).toEqual({
      digitos: "5531998966398",
      fonte: "cadastro",
    });
  });

  it("WAHA que aceita e não responde não segura a ligação além do prazo", async () => {
    // Sem prazo: duas grafias × 15 s de teto passavam dos 30 s do navegador, a
    // tela mostrava erro e a ligação saía mesmo assim, uma por clique.
    const { db } = supabaseCom("sessao");
    const pendurado = {
      checkContactExists: vi.fn(() => new Promise(() => undefined)),
    } as unknown as WahaClient;
    const inicio = Date.now();
    const r = await resolverNumeroDiscavel(db, ORG, "+5531998966398", { waha: () => pendurado, prazoMs: 50 });
    expect(r).toEqual({ digitos: "5531998966398", fonte: "cadastro" });
    expect(Date.now() - inicio).toBeLessThan(2_000);
  });
});
