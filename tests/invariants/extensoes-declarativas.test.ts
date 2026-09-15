import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";

// Mesmo Postgres efêmero do test:db. Dados inteiramente sintéticos; nenhuma rede de pacote.
if (!process.env.TEST_DB_PORT) throw new Error("TEST_DB_PORT ausente — execute pnpm test:db");
const pool = new Pool({ connectionString: `postgresql://postgres:postgres@127.0.0.1:${process.env.TEST_DB_PORT}/postgres`, max: 6 });
const actor = "e2550000-0000-4000-8000-000000000001";
const orgA = "e2550000-0000-4000-8000-000000000002";
const orgB = "e2550000-0000-4000-8000-000000000003";
const adminA = "e2550000-0000-4000-8000-000000000004";
const adminB = "e2550000-0000-4000-8000-000000000005";
const viewer = "e2550000-0000-4000-8000-000000000006";
const manager = "e2550000-0000-4000-8000-000000000007";
const query = (text: string, values: unknown[] = []) => pool.query(text, values);
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

async function withRole(role: "service_role" | "authenticated" | "anon", text: string, values: unknown[] = [], user = viewer) {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query(`set local role ${role}`);
    await c.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: user, role })]);
    const result = await c.query(text, values);
    await c.query("commit");
    return result;
  } catch (error) {
    await c.query("rollback");
    throw error;
  } finally { c.release(); }
}
const rpc = async (name: string, args: unknown[]) => {
  const r = await withRole("service_role", `select public.fn_extensions_${name}(${args.map((_, i) => `$${i + 1}`).join(",")}) result`, args);
  return r.rows[0].result;
};
function artifact(name = "guia-tarefas", version = "1.0.0") {
  const manifest = {
    format_version: 1, profile: "declarative", publisher: "invariant", name, version, license: "MIT",
    host_api: { min: 1, max: 1 }, permissions: ["navigation.tasks"], dependencies: [], data: { mode: "none" },
    display: { title: { "pt-BR": "Guia" }, summary: { "pt-BR": "Organize as tarefas" }, category: "productivity", icon: "ListChecks" },
    configuration: { density: "comfortable", show_description: true },
    contributions: { crm_cards: [{ id: "primeira-tarefa", title: { "pt-BR": "Começar" }, description: { "pt-BR": "Passo inicial" }, icon: "ListChecks",
      blocks: [{ heading: { "pt-BR": "Ação" }, body: { "pt-BR": "Crie sua tarefa" } }], action: { label: { "pt-BR": "Abrir tarefas" }, capability: "tasks.open" } }] },
  };
  const { publisher, license, host_api, display, permissions } = manifest;
  const entry = { publisher, name, version, license, host_api, display, permissions, sha256: hash(manifest), byte_length: Buffer.byteLength(JSON.stringify(manifest)) };
  return { manifest, entry };
}
const base = artifact();
let catalog: string;
let seq = 0;
const origin = () => `https://extensoes-${++seq}.invariant.test`;
const admit = async (entries = [base.entry], revision = 1, url = origin(), key = randomUUID()) => {
  const snapshot = { format_version: 1, origin: url, revision, entries };
  return rpc("admit_catalog", [actor, key, snapshot, hash(snapshot)]);
};
const prepare = (item = base, key = randomUUID(), cat = catalog, who = actor) => rpc("prepare_install", [who, key, cat, item.entry.publisher, item.entry.name, item.entry.version]);
const finish = (key: string, item = base, who = actor) => rpc("finish_install", [who, key, item.manifest, item.entry.sha256, item.entry.byte_length, JSON.stringify(item.manifest)]);
const install = async (item = base, cat = catalog) => { const p = await prepare(item, randomUUID(), cat); return (await finish(p.id, item)).installation_id as string; };
const configure = (id: string, revision = 0, enabled = true, config: unknown = null, key = randomUUID(), org = orgA, who = adminA) =>
  rpc("configure", [who, org, id, key, revision, enabled, config]);

async function clean() {
  await query("delete from extension_operations where actor_id in ($1,$2,$3,$4,$5)", [actor, adminA, adminB, viewer, manager]);
  await query("delete from organization_extensions where organization_id in ($1,$2)", [orgA, orgB]);
  await query("delete from extension_installations where catalog_id in(select id from extension_catalogs where origin like 'https://extensoes-%.invariant.test')");
  await query("delete from extension_artifacts a where not exists(select 1 from extension_installations i where i.artifact_id=a.id) and a.manifest->>'publisher'='invariant'");
  await query("delete from extension_catalogs where origin like 'https://extensoes-%.invariant.test'");
  await query("delete from system_update_runs where requested_by=$1", [actor]);
}
beforeAll(async () => {
  for (const id of [actor, adminA, adminB, viewer, manager]) await query("insert into auth.users(id,email) values($1,$2) on conflict(id) do nothing", [id, `${id}@invariant.test`]);
  for (const [id, slug] of [[orgA, "extensoes-a"], [orgB, "extensoes-b"]]) await query("insert into organizations(id,slug,legal_name,display_name) values($1,$2,'Extensões de teste','Extensões de teste') on conflict(id) do nothing", [id, slug]);
  for (const [user, org, role] of [[adminA, orgA, "admin"], [adminB, orgB, "admin"], [viewer, orgA, "viewer"], [manager, orgA, "manager"]]) {
    await query("insert into user_organizations(user_id,organization_id,role,accepted_at) values($1,$2,$3,now()) on conflict(user_id,organization_id) do update set role=excluded.role,accepted_at=now(),revoked_at=null", [user, org, role]);
  }
  await query("insert into platform_admins(user_id,granted_by,scope,mfa_required,reason) values($1,$1,'full',false,'Teste de extensões') on conflict(user_id) do update set revoked_at=null,scope='full'", [actor]);
});
beforeEach(async () => {
  await clean();
  await query("update platform_admins set revoked_at=null,scope='full' where user_id=$1", [actor]);
  await query("update user_organizations set revoked_at=null,accepted_at=now() where user_id in($1,$2,$3,$4)", [adminA, adminB, viewer, manager]);
  catalog = (await admit()).catalog_id;
});
afterAll(async () => { await clean(); await pool.end(); });

describe("extensões: autoridade e isolamento reais", () => {
  it("membros leem só seu vínculo e nenhuma escrita direta passa, inclusive service_role", async () => {
    const id = await install();
    await configure(id);
    await configure(id, 0, true, null, randomUUID(), orgB, adminB);
    for (const [user, own, other] of [[viewer, orgA, orgB], [adminB, orgB, orgA]]) {
      expect((await withRole("authenticated", "select * from organization_extensions where organization_id=$1", [own], user)).rowCount).toBe(1);
      expect((await withRole("authenticated", "select * from organization_extensions where organization_id=$1", [other], user)).rowCount).toBe(0);
    }
    for (const role of ["anon", "authenticated", "service_role"] as const) {
      for (const command of ["insert", "update", "delete"]) {
        const statement = command === "insert" ? "insert into organization_extensions(organization_id,installation_id,enabled,configuration,revision) values($1,$2,false,'{}',1)" :
          command === "update" ? "update organization_extensions set enabled=false where organization_id=$1 and installation_id=$2" : "delete from organization_extensions where organization_id=$1 and installation_id=$2";
        await expect(withRole(role, statement, [orgA, id], adminA)).rejects.toMatchObject({ code: "42501" });
      }
    }
    await query("update user_organizations set revoked_at=now() where user_id=$1", [viewer]);
    expect((await withRole("authenticated", "select * from organization_extensions", [], viewer)).rowCount).toBe(0);
  });

  it("tabelas de instância fechadas e seis RPCs não são alcançáveis por anon/authenticated", async () => {
    const id = await install();
    await configure(id);
    const calls: [string, unknown[]][] = [
      ["admit_catalog", [actor, randomUUID(), {}, "a".repeat(64)]], ["prepare_install", [actor, randomUUID(), catalog, "invariant", "guia-tarefas", "1.0.0"]],
      ["finish_install", [actor, randomUUID(), {}, "a".repeat(64), 1, "{}"]], ["fail_install", [actor, randomUUID(), "extension_download_failed"]],
      ["cancel_install", [actor, randomUUID()]], ["configure", [adminA, orgA, id, randomUUID(), 0, true, null]],
    ];
    for (const role of ["anon", "authenticated"] as const) {
      for (const table of ["extension_catalogs", "extension_artifacts", "extension_installations", "extension_operations"]) {
        await expect(withRole(role, `select * from ${table}`)).rejects.toMatchObject({ code: "42501" });
      }
      for (const [name, args] of calls) await expect(withRole(role, `select fn_extensions_${name}(${args.map((_, i) => `$${i + 1}`).join(",")})`, args)).rejects.toMatchObject({ code: "42501" });
    }
    for (const table of ["extension_artifacts", "extension_installations"]) await expect(withRole("service_role", `delete from ${table}`)).rejects.toMatchObject({ code: "42501" });
  });

  it("ator revogado, viewer, manager, convite não aceito e organização vizinha são recusados na RPC", async () => {
    const id = await install();
    for (const who of [viewer, manager, adminB]) await expect(configure(id, 0, true, null, randomUUID(), orgA, who)).rejects.toThrow("extension_forbidden");
    await query("update user_organizations set accepted_at=null where user_id=$1", [adminA]);
    await expect(configure(id)).rejects.toThrow("extension_forbidden");
    await query("update platform_admins set scope='support_readonly' where user_id=$1", [actor]);
    await expect(prepare()).rejects.toThrow("extension_forbidden");
    await query("update platform_admins set scope='full',revoked_at=now() where user_id=$1", [actor]);
    await expect(admit()).rejects.toThrow("extension_forbidden");
  });
});

describe("extensões: publicação transacional e recibos", () => {
  it("prepare e finish repetidos devolvem o mesmo recibo e um único artefato/ponteiro", async () => {
    const key = randomUUID();
    const p = await prepare(base, key);
    expect(p.status).toBe("preparing");
    expect((await query("select * from extension_installations")).rowCount).toBe(0);
    expect(await prepare(base, key)).toEqual(p);
    const done = await finish(key);
    expect(done.status).toBe("completed");
    expect(await finish(key)).toEqual(done);
    expect(await prepare(base, key)).toEqual(done);
    expect((await query("select * from extension_installations where catalog_id=$1", [catalog])).rowCount).toBe(1);
    await expect(prepare(artifact("outro-guia"), key)).rejects.toThrow("extension_idempotency_conflict");
    await expect(rpc("finish_install", [actor, key, { ...base.manifest, configuration: { density: "compact", show_description: true } }, base.entry.sha256, base.entry.byte_length, JSON.stringify(base.manifest)])).rejects.toThrow("extension_artifact_mismatch");
  });

  it("cancelamento impede conclusão tardia; falha terminal não libera a execução antiga", async () => {
    const p = await prepare();
    expect((await rpc("cancel_install", [actor, p.id])).status).toBe("cancelled");
    expect((await finish(p.id)).status).toBe("cancelled");
    expect((await query("select * from extension_installations where catalog_id=$1", [catalog])).rowCount).toBe(0);
    const retry = await prepare();
    const failed = await rpc("fail_install", [actor, retry.id, "extension_download_failed"]);
    expect(failed.status).toBe("failed");
    expect(await rpc("fail_install", [actor, retry.id, "extension_download_failed"])).toEqual(failed);
    expect(await finish(retry.id)).toEqual(failed);
    await expect(rpc("fail_install", [actor, retry.id, "corpo remoto malicioso"])).rejects.toThrow("extension_invalid_input");
    await expect(rpc("fail_install", [actor, retry.id, "extension_storage_failed"])).rejects.toThrow("extension_idempotency_conflict");
    const next = await prepare();
    expect((await finish(next.id)).status).toBe("completed");
  });

  it("admissão monotônica invalida preparação, preserva instalação e rejeita mesmo número divergente", async () => {
    const c = (await query("select * from extension_catalogs where id=$1", [catalog])).rows[0];
    const key = randomUUID();
    const admitted = await admit([base.entry], 1, c.origin, key);
    expect(await admit([base.entry], 1, c.origin, key)).toEqual(admitted);
    const p = await prepare();
    await admit([base.entry], 2, c.origin);
    expect((await finish(p.id)).status).toBe("cancelled");
    expect((await finish(p.id)).error_code).toBe("extension_catalog_stale");
    await expect(admit([base.entry], 1, c.origin)).rejects.toThrow("extension_catalog_revision_conflict");
    await expect(admit([{ ...base.entry, sha256: "f".repeat(64) }], 2, c.origin)).rejects.toThrow("extension_catalog_revision_conflict");
    const id = await install();
    await admit([], 3, c.origin);
    expect((await query("select id from extension_installations where id=$1", [id])).rowCount).toBe(1);
  });

  it("mesma versão/digest diferente conflita, upgrade é recusado, origens diferentes coexistem", async () => {
    await install();
    const c = (await query("select origin from extension_catalogs where id=$1", [catalog])).rows[0];
    await admit([{ ...base.entry, sha256: "f".repeat(64) }, artifact("guia-tarefas", "2.0.0").entry], 2, c.origin);
    await expect(prepare()).rejects.toThrow("extension_version_conflict");
    await expect(prepare(artifact("guia-tarefas", "2.0.0"))).rejects.toThrow("extension_version_update_unsupported");
    const other = (await admit()).catalog_id;
    await install(base, other);
    expect((await query("select * from extension_installations where publisher='invariant'")).rowCount).toBe(2);
  });

  it("bytes, hash, metadata e manifesto trocados não publicam nada", async () => {
    const p = await prepare();
    for (const args of [
      [base.manifest, "e".repeat(64), base.entry.byte_length], [base.manifest, base.entry.sha256, base.entry.byte_length + 1],
      [{ ...base.manifest, publisher: "invasor" }, base.entry.sha256, base.entry.byte_length],
      [{ ...base.manifest, permissions: ["tasks.read"] }, base.entry.sha256, base.entry.byte_length],
      [{ ...base.manifest, dependencies: ["codigo"] }, base.entry.sha256, base.entry.byte_length],
    ]) await expect(rpc("finish_install", [actor, p.id, ...args, JSON.stringify(base.manifest)])).rejects.toThrow("extension_artifact_mismatch");
    expect((await query("select * from extension_artifacts where sha256=$1", [base.entry.sha256])).rowCount).toBe(0);
    expect((await query("select status from extension_operations where id=$1", [p.id])).rows[0].status).toBe("preparing");
  });

  it("guarda os bytes UTF-8 exatos, rejeita reconstrução e saneia JSON inválido", async () => {
    const document = JSON.stringify(base.manifest, null, 2);
    const entry = { ...base.entry, sha256: createHash("sha256").update(document).digest("hex"), byte_length: Buffer.byteLength(document) };
    const c = (await query("select origin from extension_catalogs where id=$1", [catalog])).rows[0];
    await admit([entry], 2, c.origin);
    const p = await prepare();
    await expect(finish(p.id)).rejects.toThrow("extension_artifact_mismatch");
    await rpc("finish_install", [actor, p.id, base.manifest, entry.sha256, entry.byte_length, document]);
    expect((await query("select document from extension_artifacts where sha256=$1", [entry.sha256])).rows[0].document).toBe(document);
    const badDocument = "{invalid";
    const badEntry = { ...base.entry, name: "json-invalido", sha256: createHash("sha256").update(badDocument).digest("hex"), byte_length: Buffer.byteLength(badDocument) };
    await admit([entry, badEntry], 3, c.origin);
    const broken = await prepare(artifact("json-invalido"));
    await expect(rpc("finish_install", [actor, broken.id, artifact("json-invalido").manifest, badEntry.sha256, badEntry.byte_length, badDocument])).rejects.toMatchObject({ code: "P0001", message: "extension_artifact_mismatch" });
  });

  it("tetos de catálogo e identidades incluem preparações ainda publicáveis", async () => {
    for (let i = 1; i < 8; i++) await admit();
    await expect(admit()).rejects.toThrow("extension_catalog_limit");
    const items = Array.from({ length: 128 }, (_, i) => artifact(`limite-${i + 1}`));
    const c = (await query("select origin from extension_catalogs where id=$1", [catalog])).rows[0];
    await admit(items.map(x => x.entry), 2, c.origin);
    let first = "";
    for (const item of items) {
      const p = await prepare(item);
      if (!first) first = p.id;
    }
    const other = (await query("select id from extension_catalogs where id<>$1 limit 1", [catalog])).rows[0].id;
    await expect(prepare(base, randomUUID(), other)).rejects.toThrow("extension_installation_limit");
    await finish(first, items[0]);
    await expect(prepare(base, randomUUID(), other)).rejects.toThrow("extension_installation_limit");
    const cancelled = (await query("select id from extension_operations where status='preparing' limit 1")).rows[0].id;
    await rpc("cancel_install", [actor, cancelled]);
    expect((await prepare(base, randomUUID(), other)).status).toBe("preparing");
  });

  it("replay também revalida o ator vigente", async () => {
    const p = await prepare();
    await query("update platform_admins set revoked_at=now() where user_id=$1", [actor]);
    for (const attempt of [() => prepare(base, p.id), () => finish(p.id), () => rpc("fail_install", [actor, p.id, "extension_download_failed"]), () => rpc("cancel_install", [actor, p.id])]) await expect(attempt()).rejects.toThrow("extension_forbidden");
  });
});

describe("extensões: configuração com CAS e limite agregado", () => {
  it("desativar e reativar preservam configuração; replay conserva resultado original", async () => {
    const id = await install();
    const custom = { density: "compact", show_description: false };
    const key = randomUUID();
    const first = await configure(id, 0, true, custom, key);
    expect(first.result.organization_extension).toMatchObject({ revision: 1, enabled: true, configuration: custom });
    await configure(id, 1, false);
    const active = await configure(id, 2, true);
    expect(active.result.organization_extension).toMatchObject({ revision: 3, enabled: true, configuration: custom });
    expect(await configure(id, 0, true, custom, key)).toEqual(first);
    await expect(configure(id, 0, false, custom, key)).rejects.toThrow("extension_idempotency_conflict");
    await expect(configure(id, 1)).rejects.toThrow("extension_revision_conflict");
    await query("update user_organizations set revoked_at=now() where user_id=$1", [adminA]);
    await expect(configure(id, 0, true, custom, key)).rejects.toThrow("extension_forbidden");
  });

  it("mesma revisão concorrente só grava uma vez; mesma chave concorrente devolve recibo idêntico", async () => {
    const id = await install();
    const key = randomUUID();
    const [a, b] = await Promise.all([configure(id, 0, true, null, key), configure(id, 0, true, null, key)]);
    expect(a).toEqual(b);
    const race = await Promise.allSettled([configure(id, 1, false), configure(id, 1, true, { density: "compact", show_description: false })]);
    expect(race.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(race.find(r => r.status === "rejected")).toMatchObject({ reason: { message: "extension_revision_conflict" } });
  });

  it("duas ativações concorrentes disputam a oitava vaga sem afetar outra organização", async () => {
    const items = Array.from({ length: 9 }, (_, i) => artifact(`guia-${i + 1}`));
    const c = (await query("select origin from extension_catalogs where id=$1", [catalog])).rows[0];
    await admit(items.map(x => x.entry), 2, c.origin);
    const ids: string[] = [];
    for (const item of items) ids.push(await install(item));
    for (const id of ids.slice(0, 7)) await configure(id);
    const race = await Promise.allSettled(ids.slice(7).map(id => configure(id)));
    expect(race.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(race.find(r => r.status === "rejected")).toMatchObject({ reason: { message: "extension_active_limit" } });
    expect((await query("select count(*)::int n from organization_extensions where organization_id=$1 and enabled", [orgA])).rows[0].n).toBe(8);
    const ninthInstallation = ids[8];
    if (!ninthInstallation) throw new Error("Fixture incompleta: o teste exige nove extensões instaladas para disputar a oitava vaga");
    await configure(ninthInstallation, 0, true, null, randomUUID(), orgB, adminB);
  });
});

async function lockedClient(): Promise<PoolClient> {
  const c = await pool.connect();
  await c.query("begin");
  await c.query("select pg_advisory_xact_lock(255,1)");
  return c;
}
describe("extensões: coordenação com atualização do core", () => {
  it("preparação bloqueia INSERT e transição dispatched, até cancelamento explícito", async () => {
    const p = await prepare();
    await expect(query("insert into system_update_runs(requested_by) values($1)", [actor])).rejects.toThrow("extension_preparation_in_progress");
    const update = (await query("insert into system_update_runs(requested_by,status) values($1,'failed') returning id", [actor])).rows[0].id;
    await expect(query("update system_update_runs set status='dispatched' where id=$1", [update])).rejects.toThrow("extension_preparation_in_progress");
    await rpc("cancel_install", [actor, p.id]);
    await query("update system_update_runs set status='dispatched' where id=$1", [update]);
    await expect(prepare()).rejects.toThrow("extension_core_update_in_progress");
    expect((await finish(p.id)).status).toBe("cancelled");
  });

  it("atualização em voo ganha trava antes de prepare; não surge preparação concorrente", async () => {
    const c = await lockedClient();
    try {
      await c.query("insert into system_update_runs(requested_by) values($1)", [actor]);
      const pending = prepare();
      const assertion = expect(pending).rejects.toThrow("extension_core_update_in_progress");
      await c.query("commit");
      await assertion;
    } finally { await c.query("rollback"); c.release(); }
  });

  it("cancelamento sob trava encerra autoridade antes de finish tardio e permite atualizar", async () => {
    const p = await prepare();
    const c = await lockedClient();
    try {
      await c.query("select fn_extensions_cancel_install($1,$2)", [actor, p.id]);
      const late = finish(p.id);
      await c.query("commit");
      expect((await late).status).toBe("cancelled");
      await query("insert into system_update_runs(requested_by) values($1)", [actor]);
      expect((await query("select * from extension_installations where catalog_id=$1", [catalog])).rowCount).toBe(0);
    } finally { await c.query("rollback"); c.release(); }
  });

  it("mesma chave prepare concorrente não duplica; outra chave mesma identidade é recusada", async () => {
    const key = randomUUID();
    const [a, b] = await Promise.all([prepare(base, key), prepare(base, key)]);
    expect(a).toEqual(b);
    await expect(prepare()).rejects.toThrow("extension_preparation_in_progress");
  });
});
