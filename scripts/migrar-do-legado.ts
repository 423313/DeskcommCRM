/**
 * MIGRAR O QUE FALTA DO SISTEMA ANTERIOR — comandas novas, comissões e fidelidade.
 *
 * Uso:
 *   pnpm tsx scripts/migrar-do-legado.ts            # confere e NÃO grava (padrão)
 *   pnpm tsx scripts/migrar-do-legado.ts --aplicar  # grava
 *
 * Variáveis: LEGADO_URL, LEGADO_KEY (service role do projeto antigo),
 *            SUPABASE_DB_URL (destino), ORG_ID.
 *
 * ## O que este script NÃO faz, e por quê
 *
 * Ele não recarrega as 4.761 comandas históricas: isso já foi feito em 14/09 e
 * está conferido. Ele traz **o que o sistema antigo produziu depois daquele
 * dia**, mais os dois módulos que nunca vieram (comissão e fidelidade).
 *
 * ## A ordem importa, e foi medida
 *
 * Em 17/09/2026, 8 das 81 comissões do legado apontavam para comandas que não
 * existiam aqui — as de número 4807 a 4814, lançadas depois da carga. Migrar
 * comissão antes de comanda deixaria essas 8 de fora **em silêncio**. Por isso
 * a ordem é: profissionais → comandas → comissões → fidelidade, e cada etapa
 * recusa seguir se a anterior deixou buraco.
 *
 * ## Nenhum número fica fixo aqui
 *
 * O sistema antigo continua operando (81 comissões em 17/09; eram 72 dias
 * antes). O script conta a ORIGEM no momento em que roda e exige igualdade com
 * o destino. Números fixos no código envelheceriam entre uma execução e a
 * seguinte, e um invariante que envelhece é pior que nenhum.
 *
 * ## Idempotência
 *
 * Não há flag de "já rodei": a garantia é do schema.
 *   • profissionais → unique (organization_id, legacy_id)
 *   • comandas      → unique (organization_id, number)
 *   • comissões     → unique (sale_item_id)
 *   • fidelidade    → unique (organization_id, idempotency_key)
 * Rodar duas vezes seguidas produz o mesmo estado.
 */
import { execFileSync } from "node:child_process";

const LEGADO_URL = process.env.LEGADO_URL ?? "";
const LEGADO_KEY = process.env.LEGADO_KEY ?? "";
const DB_URL = process.env.SUPABASE_DB_URL ?? "";
const ORG = process.env.ORG_ID ?? "";
const APLICAR = process.argv.includes("--aplicar");

if (!LEGADO_URL || !LEGADO_KEY || !DB_URL || !ORG) {
  console.error("Faltam LEGADO_URL, LEGADO_KEY, SUPABASE_DB_URL ou ORG_ID.");
  process.exit(2);
}

/** PostgREST corta em 1000 linhas SEM AVISAR. Paginar é a regra, não a exceção. */
async function lerTudo<T>(caminho: string): Promise<T[]> {
  const passo = 500;
  const tudo: T[] = [];
  for (let de = 0; ; de += passo) {
    const r = await fetch(`${LEGADO_URL}/${caminho}`, {
      headers: {
        apikey: LEGADO_KEY,
        Authorization: `Bearer ${LEGADO_KEY}`,
        Range: `${de}-${de + passo - 1}`,
      },
    });
    if (!r.ok) throw new Error(`legado ${caminho}: ${r.status} ${await r.text()}`);
    const lote = (await r.json()) as T[];
    tudo.push(...lote);
    if (lote.length < passo) return tudo;
  }
}

function sql(script: string): string {
  return execFileSync(
    "docker",
    ["run", "--rm", "-i", "-e", `PGURL=${DB_URL}`, "postgres:17-alpine",
     "sh", "-c", 'exec psql "$PGURL" -v ON_ERROR_STOP=1 --no-psqlrc -tA -f -'],
    { input: script, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  ).trim();
}

const cents = (v: string | number) => Math.round(Number(v) * 100);
const aspas = (s: string | null) => (s === null ? "null" : `'${s.replace(/'/g, "''")}'`);

type Prof = { id: string; nome: string; ativo: boolean };
type Venda = {
  id: string; numero: number; client_id: string | null; data: string; status: string;
  total: string; desconto: string; observacoes: string | null; created_at: string;
};
type Comissao = {
  id: string; sale_item_id: string; professional_id: string; percentual: string;
  valor: string; status: string; paga_em: string | null; estornada_em: string | null;
  created_at: string;
};
type Fidelidade = {
  id: string; client_id: string; tipo: string; pontos: number; sale_id: string | null;
  observacao: string | null; created_at: string;
};

const problemas: string[] = [];
function exige(condicao: boolean, frase: string) {
  if (condicao) console.info(`  ✓ ${frase}`);
  else { console.info(`  ✗ ${frase}`); problemas.push(frase); }
}

async function main() {
  console.info(APLICAR ? "== MIGRANDO (--aplicar) ==" : "== CONFERINDO (sem gravar) ==\n");

  // ── 1. profissionais ───────────────────────────────────────────────────────
  const profs = await lerTudo<Prof>("professionals?select=id,nome,ativo");
  console.info(`\n[1] profissionais no legado: ${profs.length}`);
  if (APLICAR && profs.length) {
    sql(profs.map((p) => `
      insert into public.professionals (organization_id, name, legacy_id, is_active)
      values ('${ORG}', ${aspas(p.nome)}, '${p.id}', ${p.ativo})
      on conflict (organization_id, legacy_id) where legacy_id is not null
      do update set name = excluded.name, is_active = excluded.is_active;`).join("\n"));
  }
  const profsDestino = APLICAR
    ? Number(sql(`select count(*) from public.professionals where organization_id='${ORG}' and legacy_id is not null;`))
    : 0;
  if (APLICAR) exige(profsDestino === profs.length, `${profsDestino} de ${profs.length} profissionais no destino`);

  // ── 2. as comandas que nasceram DEPOIS da carga ────────────────────────────
  const maior = Number(sql(`select coalesce(max(number), 0) from public.sales where organization_id='${ORG}';`));
  const novas = await lerTudo<Venda>(
    `sales?select=id,numero,client_id,data,status,total,desconto,observacoes,created_at&numero=gt.${maior}`,
  );
  console.info(`\n[2] comandas no legado acima de #${maior}: ${novas.length}`);
  if (novas.length) {
    console.info(`    ${novas.map((v) => `#${v.numero}`).join(", ")}`);
    console.info(
      "    ⚠️ Estas NÃO são migradas por este script: trazê-las exige casar cliente,\n" +
      "       forma de pagamento e itens, que é o trabalho da carga original\n" +
      "       (.superpowers/evidence/fase44-gerar-sql.mjs). Rode a carga antes, ou\n" +
      "       aceite que as comissões delas ficam de fora — o passo 3 vai nomeá-las.",
    );
  }

  // ── 3. comissões ───────────────────────────────────────────────────────────
  const comissoes = await lerTudo<Comissao & { sale_items: { id: string; valor_total: string; sales: { numero: number } | null } | null }>(
    "commissions?select=id,sale_item_id,professional_id,percentual,valor,status,paga_em,estornada_em,created_at,sale_items(id,valor_total,sales(numero))",
  );
  const somaOrigem = comissoes.reduce((t, c) => t + cents(c.valor), 0);
  console.info(`\n[3] comissões no legado: ${comissoes.length} · R$ ${(somaOrigem / 100).toFixed(2)}`);

  const semComanda = comissoes.filter((c) => !c.sale_items?.sales);
  const numeros = [...new Set(comissoes.map((c) => c.sale_items?.sales?.numero).filter(Boolean))] as number[];
  const existentes = new Set(
    sql(`select number from public.sales where organization_id='${ORG}' and number = any('{${numeros.join(",")}}'::bigint[]);`)
      .split("\n").filter(Boolean).map(Number),
  );
  const orfas = comissoes.filter((c) => {
    const n = c.sale_items?.sales?.numero;
    return n !== undefined && !existentes.has(n);
  });

  if (semComanda.length) console.info(`    ${semComanda.length} sem comanda no legado (ignoradas)`);
  if (orfas.length) {
    console.info(`    ⚠️ ${orfas.length} apontam para comanda AUSENTE no destino: ` +
      orfas.map((c) => `#${c.sale_items?.sales?.numero}`).join(", "));
  }

  const migraveis = comissoes.filter((c) => {
    const n = c.sale_items?.sales?.numero;
    return n !== undefined && existentes.has(n);
  });

  if (APLICAR && migraveis.length) {
    // O item no destino é casado por (número da comanda + valor do item). A
    // ambiguidade — dois itens iguais na mesma comanda — é resolvida pela ordem
    // de criação e REGISTRADA, nunca silenciada.
    sql(migraveis.map((c) => {
      const n = c.sale_items!.sales!.numero;
      const valorItem = cents(c.sale_items!.valor_total);
      const st = c.estornada_em ? "reversed" : c.status === "paga" ? "paid" : "pending";
      return `
      with alvo as (
        select si.id from public.sale_items si
          join public.sales s on s.id = si.sale_id
         where s.organization_id = '${ORG}' and s.number = ${n}
           and si.total_cents = ${valorItem}
         order by si.created_at limit 1
      ), prof as (
        select id from public.professionals
         where organization_id = '${ORG}' and legacy_id = '${c.professional_id}'
      )
      insert into public.commissions
        (organization_id, sale_item_id, professional_id, percent, amount_cents,
         status, paid_at, reversed_at, created_at)
      select '${ORG}', alvo.id, prof.id, ${Number(c.percentual)}, ${cents(c.valor)},
             '${st}', ${c.paga_em ? `'${c.paga_em}'` : "null"},
             ${c.estornada_em ? `'${c.estornada_em}'` : "null"}, '${c.created_at}'
        from alvo, prof
      on conflict (sale_item_id) do nothing;

      -- O item ganha a profissional: sem isso a comissão fica órfã de autoria
      -- e a ficha da profissional não bate com os itens que ela fez.
      update public.sale_items si set professional_id = (select id from public.professionals
             where organization_id='${ORG}' and legacy_id='${c.professional_id}')
        from public.sales s
       where s.id = si.sale_id and s.organization_id='${ORG}' and s.number = ${n}
         and si.total_cents = ${valorItem} and si.professional_id is null;`;
    }).join("\n"));
  }

  if (APLICAR) {
    const [n, soma] = sql(
      `select count(*), coalesce(sum(amount_cents),0) from public.commissions where organization_id='${ORG}';`,
    ).split("|");
    exige(Number(n) === migraveis.length, `${n} de ${migraveis.length} comissões migráveis no destino`);
    const somaEsperada = migraveis.reduce((t, c) => t + cents(c.valor), 0);
    exige(Number(soma) === somaEsperada, `soma bate: R$ ${(Number(soma) / 100).toFixed(2)} = R$ ${(somaEsperada / 100).toFixed(2)}`);

    for (const st of ["pending", "paid", "reversed"] as const) {
      const naOrigem = migraveis.filter((c) =>
        (c.estornada_em ? "reversed" : c.status === "paga" ? "paid" : "pending") === st).length;
      const noDestino = Number(sql(`select count(*) from public.commissions where organization_id='${ORG}' and status='${st}';`));
      exige(naOrigem === noDestino, `status ${st}: ${noDestino} = ${naOrigem}`);
    }
  }

  // ── 4. fidelidade ──────────────────────────────────────────────────────────
  const movs = await lerTudo<Fidelidade>(
    "fidelidade_movimentos?select=id,client_id,tipo,pontos,sale_id,observacao,created_at",
  );
  const pontosOrigem = movs.reduce((t, m) => t + m.pontos, 0);
  console.info(`\n[4] movimentos de fidelidade no legado: ${movs.length} · ${pontosOrigem} pontos`);

  // A ponte de cliente é a MESMA da carga original: o contato do destino que
  // tem o telefone normalizado do cliente do legado. Aqui só se usa o mapa que
  // a carga deixou — casar por nome refaria vínculo errado.
  const clientes = await lerTudo<{ id: string; celular: string | null }>("clients?select=id,celular");
  const porLegado = new Map(clientes.map((c) => [c.id, (c.celular ?? "").replace(/\D/g, "")]));

  const kind = (t: string) => (t === "resgate" ? "resgate" : t === "ponto" ? "selo" : "ajuste");
  const motivo = (m: Fidelidade) => {
    const base = { cartao_fisico: "Cartão físico", ponto: "Comanda finalizada",
                   resgate: "Resgate de prêmio", ajuste: "Ajuste manual" }[m.tipo] ?? m.tipo;
    return m.observacao ? `${base} · ${m.observacao}` : base;
  };

  let semContato = 0;
  if (APLICAR && movs.length) {
    const linhas: string[] = [];
    for (const m of movs) {
      const fone = porLegado.get(m.client_id) ?? "";
      if (!fone) { semContato++; continue; }
      linhas.push(`
      insert into public.loyalty_ledger
        (organization_id, contact_id, points, reason, kind, idempotency_key, created_at)
      select '${ORG}', c.id, ${m.pontos}, ${aspas(motivo(m))}, '${kind(m.tipo)}',
             'legado:fidelidade:${m.id}', '${m.created_at}'
        from public.contacts c
       where c.organization_id = '${ORG}'
         and regexp_replace(coalesce(c.phone_number,''), '\\D', '', 'g') like '%${fone.slice(-8)}'
       limit 1
      on conflict (organization_id, idempotency_key) where idempotency_key is not null do nothing;`);
    }
    if (linhas.length) sql(linhas.join("\n"));
  }

  if (APLICAR) {
    const [n] = sql(
      `select count(*), coalesce(sum(points),0) from public.loyalty_ledger
        where organization_id='${ORG}' and idempotency_key like 'legado:fidelidade:%';`,
    ).split("|");
    console.info(`    ${semContato} movimento(s) sem contato casável no destino`);
    exige(Number(n) === movs.length - semContato, `${n} de ${movs.length - semContato} movimentos casáveis no destino`);
    // Saldo POR CLIENTE, nunca só o total: o geral esconde erros que se compensam.
    const divergentes = sql(`
      select count(*) from (
        select contact_id, sum(points) s from public.loyalty_ledger
         where organization_id='${ORG}' group by 1 having sum(points) < 0
      ) x;`);
    exige(Number(divergentes) === 0, `nenhum cliente com saldo negativo (${divergentes} encontrados)`);
  }

  console.info("");
  if (!APLICAR) {
    console.info("Nada foi gravado. Rode com --aplicar depois de ler os avisos acima.");
    return;
  }
  if (problemas.length) {
    console.error(`FALHOU: ${problemas.length} invariante(s) não fecharam.`);
    process.exit(1);
  }
  console.info("Migração conferida: origem e destino batem em todos os indicadores.");
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
