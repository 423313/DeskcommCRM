/**
 * O gate de agenda vale para quem SÓ CONSULTA, não só para quem marca.
 *
 * O defeito: `agenda.active` era literalmente "o agente tem
 * `crm_book_appointment`". Existe um arranjo legítimo e comum — clínica, salão,
 * consultório — em que essa ferramenta é negada de propósito, porque o negócio
 * quer que uma PESSOA confirme cada horário. Esse agente recebe
 * `crm_find_free_slots`, promete "vou verificar e te aviso" exatamente igual, e
 * ficava sem a única cura determinística que existe para isso.
 *
 * O sintoma é mudo: o gate passa, a mensagem sai, e ninguém sabe que a garantia
 * que o produto anuncia não estava armada naquele agente.
 */
import { describe, expect, it } from "vitest";

import { agendaStallGate } from "./before-send";
import { temFerramentaDeAgenda } from "../agent/inbound-turn";

// As duas frases medidas em produção que deram origem ao gate.
const PROMESSA = "Vou verificar o horário e já te aviso!";
const CONFIRMOU = "Prontinho, seu horário está confirmado para quinta!";

function ctx(over: {
  active: boolean;
  podeMarcar: boolean;
  toolCalledThisTurn: boolean;
  body: string;
}) {
  // O gate só lê `agenda` e `body`; o resto do GateContext não participa.
  return { agenda: over, body: over.body } as Parameters<typeof agendaStallGate.evaluate>[0];
}

describe("temFerramentaDeAgenda", () => {
  it("conta a de consultar, e não só a de marcar", () => {
    expect(temFerramentaDeAgenda(["crm_find_free_slots"])).toBe(true);
    expect(temFerramentaDeAgenda(["crm_book_appointment"])).toBe(true);
    expect(temFerramentaDeAgenda(["crm_reschedule_appointment"])).toBe(true);
  });

  it("quem não tem ferramenta de agenda nenhuma segue desarmado", () => {
    // Vetá-lo não teria cura: não há ferramenta que ele possa chamar.
    expect(temFerramentaDeAgenda(["crm_get_contact", "crm_list_pipelines"])).toBe(false);
    expect(temFerramentaDeAgenda([])).toBe(false);
  });
});

describe("agendaStallGate no agente que só consulta", () => {
  it("veta a promessa de verificar sem ter consultado", () => {
    const v = agendaStallGate.evaluate(
      ctx({ active: true, podeMarcar: false, toolCalledThisTurn: false, body: PROMESSA }),
    );
    expect(v.pass).toBe(false);
  });

  it("veta afirmar que está confirmado — ele nem pode confirmar", () => {
    const v = agendaStallGate.evaluate(
      ctx({ active: true, podeMarcar: false, toolCalledThisTurn: false, body: CONFIRMOU }),
    );
    expect(v.pass).toBe(false);
  });

  it("passa depois de a consulta ter rodado no turno", () => {
    const v = agendaStallGate.evaluate(
      ctx({ active: true, podeMarcar: false, toolCalledThisTurn: true, body: PROMESSA }),
    );
    expect(v.pass).toBe(true);
  });

  it("o veto NÃO manda chamar uma ferramenta que ele não tem", () => {
    // Ensinar `crm_book_appointment` a quem não a tem faz o modelo tentar,
    // falhar, e a correção vira um segundo defeito.
    const v = agendaStallGate.evaluate(
      ctx({ active: true, podeMarcar: false, toolCalledThisTurn: false, body: PROMESSA }),
    );
    expect(v.pass).toBe(false);
    if (v.pass) return;
    expect(v.reason).toContain("crm_find_free_slots");
    expect(v.reason).not.toContain("crm_book_appointment");
    expect(v.reason).not.toContain("crm_reschedule_appointment");
  });

  it("quem PODE marcar continua vendo as três ferramentas no veto", () => {
    const v = agendaStallGate.evaluate(
      ctx({ active: true, podeMarcar: true, toolCalledThisTurn: false, body: PROMESSA }),
    );
    expect(v.pass).toBe(false);
    if (v.pass) return;
    expect(v.reason).toContain("crm_book_appointment");
  });
});
