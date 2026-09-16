import { afterEach, describe, expect, it, vi } from "vitest";

import { CONVERSAS_IGNORADAS, WahaClient } from "@/lib/waha/client";

/**
 * A SESSÃO NASCIA SEM O ACERVO — e o histórico do número não tinha por onde chegar.
 *
 * ─── O que se mediu (issue #999) ────────────────────────────────────────────
 *
 * Numa instalação real, um número vinculado pelo CRM produziu 3 conversas no
 * inbox e um `store.sqlite3` de 1 MB; a mesma vinculação com o acervo pedido
 * trouxe 825 conversas e 57 MB. O que chegava era só o que acontecia depois da
 * vinculação: o passado do número ficava no aparelho.
 *
 * ─── Por que o teste olha o CORPO ENVIADO, e não o arquivo ─────────────────
 *
 * `store` não é campo nosso: é um pedido ao canal, e a única prova de que o
 * pedido foi feito é o corpo que sai de `lib/waha/client.ts` na criação da
 * sessão. O padrão da engine é `store { enabled: false, fullSync: false }` e não
 * existe variável de ambiente que o mude — quem não pede, não tem.
 *
 * O `fullSync` está na asserção pelo mesmo motivo: ligar só `enabled` deixaria o
 * acervo de hoje em dia e o passado de fora — o mesmo defeito com outra roupa.
 *
 * ─── A CLASSE: reconfigurar não pode apagar o que a criação pediu ──────────
 *
 * O segundo teste é o controle do defeito de classe: `convergirConfigDaSessao`
 * faz PUT, e o PUT de sessão do WAHA "updates a session with a FULL new
 * configuration" — troca a config inteira. Se ele reescrevesse a config a partir
 * do que ele mesmo quer (`ignore`), o acervo pedido na criação sumiria na
 * primeira reconexão de uma sessão antiga, em silêncio. O enxerto em cima da
 * config lida é o que mantém o pedido de pé, e é isso que o teste verifica.
 */
interface Chamada {
  metodo: string;
  caminho: string;
  corpo: Record<string, unknown> | null;
}

/** A sessão que o dublê "tem" do lado do canal. `null` = ainda não existe. */
interface SessaoDoDuble {
  name: string;
  status: string;
  engine: string;
  config: Record<string, unknown> | null;
}

/**
 * Dublê do WAHA que guarda o que recebeu. Sem estado, o encadeamento
 * criação → verificação → start de uma sessão existente não teria como ser
 * exercitado: o GET devolveria sempre a mesma coisa e o PUT não teria efeito.
 */
function instrumentarWaha(inicial: SessaoDoDuble | null) {
  let sessao = inicial;
  const chamadas: Chamada[] = [];

  const corpo = (init?: RequestInit): Record<string, unknown> | null =>
    init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;

  const fetchFalso = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const caminho = new URL(String(url)).pathname;
    const metodo = (init?.method ?? "GET").toUpperCase();
    const enviado = corpo(init);
    chamadas.push({ metodo, caminho, corpo: enviado });

    const responder = (status: number, dados: unknown) =>
      ({ ok: status >= 200 && status < 300, status, json: async () => dados }) as unknown as Response;

    if (metodo === "POST" && caminho === "/api/sessions") {
      if (sessao) {
        return responder(422, {
          statusCode: 422,
          error: "Unprocessable Entity",
          message: `Session '${sessao.name}' already exists. Use PUT to update it.`,
        });
      }
      sessao = {
        name: String(enviado?.name ?? ""),
        status: "SCAN_QR_CODE",
        engine: "NOWEB",
        config: (enviado?.config as Record<string, unknown> | undefined) ?? null,
      };
      return responder(201, sessao);
    }

    if (metodo === "GET" && caminho.startsWith("/api/sessions/")) {
      if (!sessao) {
        return responder(404, { statusCode: 404, error: "Not Found", message: "Session not found" });
      }
      return responder(200, sessao);
    }

    if (metodo === "PUT" && caminho.startsWith("/api/sessions/")) {
      if (!sessao) {
        return responder(404, { statusCode: 404, error: "Not Found", message: "Session not found" });
      }
      sessao = { ...sessao, config: (enviado?.config as Record<string, unknown> | undefined) ?? null };
      return responder(200, sessao);
    }

    if (metodo === "POST" && caminho.endsWith("/start")) {
      if (!sessao) {
        return responder(404, { statusCode: 404, error: "Not Found", message: "Session not found" });
      }
      sessao = { ...sessao, status: "WORKING" };
      return responder(200, sessao);
    }

    return responder(500, { erro: `rota não dublada: ${metodo} ${caminho}` });
  });

  vi.stubGlobal("fetch", fetchFalso);
  return { chamadas, sessaoAtual: () => sessao };
}

const CLIENTE = () => new WahaClient("http://waha.local", "chave-de-teste");
const ACERVO = { store: { enabled: true, fullSync: true } };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a criação da sessão do WhatsApp", () => {
  it("pede o acervo do histórico, junto com o filtro de conversas", async () => {
    const { chamadas } = instrumentarWaha(null);

    await CLIENTE().startSession("s1");

    const criacao = chamadas.find((c) => c.metodo === "POST" && c.caminho === "/api/sessions");
    expect(criacao?.corpo?.config).toEqual({
      ignore: CONVERSAS_IGNORADAS,
      noweb: ACERVO,
    });
  });

  it("leva o acervo também quando a sessão é criada fora do startSession", async () => {
    const { chamadas } = instrumentarWaha(null);

    await CLIENTE().createSession("s2");

    const criacao = chamadas.find((c) => c.metodo === "POST" && c.caminho === "/api/sessions");
    expect((criacao?.corpo?.config as Record<string, unknown>)?.noweb).toEqual(ACERVO);
  });
});

describe("a reconexão de uma sessão que já existe", () => {
  it("não apaga o acervo que a criação pediu ao reconvergir o filtro", async () => {
    // Sessão criada JÁ com o acervo, mas com o filtro de uma versão anterior
    // (sem `channels`): é o estado real de quem atualiza o CRM sem re-vincular.
    const { chamadas } = instrumentarWaha({
      name: "s1",
      status: "WORKING",
      engine: "NOWEB",
      config: {
        ignore: { status: true, broadcast: true, groups: true },
        noweb: ACERVO,
        webhooks: [{ url: "https://crm.local/webhook", events: ["message.any"] }],
      },
    });

    await CLIENTE().startSession("s1");

    const put = chamadas.find((c) => c.metodo === "PUT");
    expect(put?.corpo?.config).toMatchObject({
      ignore: CONVERSAS_IGNORADAS,
      noweb: ACERVO,
      webhooks: [{ url: "https://crm.local/webhook", events: ["message.any"] }],
    });
  });

  it("não deixa a sessão pareada antes do conserto fora do ar", async () => {
    // Sessão sem `noweb` nenhum: é toda instalação que já tinha número
    // vinculado. Ela continua subindo — exigir o acervo na compatibilidade
    // derrubaria o canal de quem não re-vinculou.
    const { chamadas } = instrumentarWaha({
      name: "s1",
      status: "STOPPED",
      engine: "NOWEB",
      config: { ignore: CONVERSAS_IGNORADAS },
    });

    const resultado = await CLIENTE().startSession("s1");

    expect(resultado.status).toBe("WORKING");
    expect(chamadas.some((c) => c.metodo === "PUT")).toBe(false);
  });

  it("não inventa o acervo numa sessão que já existe — a decisão é do operador", async () => {
    // Sessão legada, sem filtro e sem acervo: a convergência arruma o filtro e
    // NADA MAIS. Ligar o acervo de uma sessão viva reinicia a sessão e o
    // histórico passaria a ocupar disco sem ninguém ter pedido.
    const { chamadas } = instrumentarWaha({
      name: "s1",
      status: "STOPPED",
      engine: "NOWEB",
      config: {},
    });

    await CLIENTE().startSession("s1");

    const put = chamadas.find((c) => c.metodo === "PUT");
    expect(put?.corpo?.config).toEqual({ ignore: CONVERSAS_IGNORADAS });
  });
});
