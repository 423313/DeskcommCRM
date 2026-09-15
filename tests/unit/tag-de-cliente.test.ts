import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { TAG_DE_CLIENTE } from "@/lib/contacts/cliente";

/**
 * A ÚNICA divergência possível entre a etiqueta que o banco escreve e a que a
 * tela oferece no filtro.
 *
 * Quem grava `cliente` é SQL (`fn_recalcular_cliente_do_contato`, migration
 * 0262); quem filtra por ela é TypeScript. São dois literais em dois idiomas,
 * sem nada que os obrigue a concordar — e o dia em que discordarem, o filtro
 * "cliente" não acha ninguém, sem erro nenhum para investigar. É o modo de falha
 * mais caro que uma feature destas tem: silencioso e plausível ("então não temos
 * clientes marcados ainda").
 *
 * O literal mora em UM lugar do SQL — a constante `c_etiqueta` — e toda escrita
 * (acrescentar na virada para cliente, remover na virada de volta) usa a
 * constante. Por isso o teste cobra as duas coisas: a constante é igual à do
 * TypeScript, e nenhuma escrita de array usa um literal solto que pudesse
 * divergir dela.
 *
 * O teste lê o ARQUIVO, e não o banco, de propósito: assim ele roda em
 * `test:unit` (sem Postgres) e reprova o PR que muda um lado só.
 */
const MIGRATION = join(process.cwd(), "supabase/migrations/20260915180000_0262_cliente_pela_agenda.sql");
const BASELINE = join(process.cwd(), "supabase/baseline.sql");

const CONSTANTE = /c_etiqueta constant text := '([^']+)'/g;

describe("a etiqueta de cliente", () => {
  it("é a mesma no TypeScript e na constante SQL, que aparece uma vez só", () => {
    const sql = readFileSync(MIGRATION, "utf8");
    const capturas = [...sql.matchAll(CONSTANTE)].map((m) => m[1]);
    expect(capturas, "a migration 0262 declara a etiqueta numa constante única").toEqual([TAG_DE_CLIENTE]);
  });

  it("nenhuma escrita ou comparação de array usa literal solto no lugar da constante", () => {
    const sql = readFileSync(MIGRATION, "utf8");
    // Só o CÓDIGO: comentário que cite `array_append(tags, 'x')` não escreve nada.
    const codigo = sql
      .split("\n")
      .map((linha) => linha.replace(/--.*$/, ""))
      .join("\n");
    const soltos = codigo.match(/array_(append|remove)\([^)]*'|'[^']*'\s*=\s*any\(/g) ?? [];
    expect(soltos).toEqual([]);
  });

  it("o baseline carrega a mesma constante e o trigger de UPDATE — é ele que o self-hoster aplica", () => {
    // Migração que só entra em `migrations/` não chega a quem instalou pelo kit.
    const baseline = readFileSync(BASELINE, "utf8");
    const capturas = [...baseline.matchAll(CONSTANTE)].map((m) => m[1]);
    expect(capturas).toEqual([TAG_DE_CLIENTE]);
    expect(baseline).toContain("trg_agendamento_recalcula_cliente");
  });
});
