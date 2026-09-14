import { lstat, mkdir, readFile, readdir, realpath, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const PURPOSE = 'extensions-architecture-bench';

/** A bancada só aceita o banco sintético e não permite parâmetros de redirecionamento. */
export function assertLocalDatabaseUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Endereço inválido da bancada.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
    || url.hostname !== '127.0.0.1'
    || url.username !== 'extensions_bench_owner'
    || url.password || url.pathname !== '/extensions_bench'
    || url.search || url.hash || Number(url.port) < 1024 || Number(url.port) > 65535) {
    throw new Error('Conexão recusada: destino não pertence à bancada local.');
  }
  return url.href;
}

async function plainDirectory(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const info = await lstat(directory);
  if (info.isSymbolicLink() || !info.isDirectory()) {
    throw new Error('A bancada não aceita diretório simbólico.');
  }
}

export async function ensureOwnedWorkspace(repoRoot) {
  const root = await realpath(repoRoot);
  let directory = root;
  for (const part of ['.superpowers', 'evidence', 'extensoes-bancada']) {
    directory = path.join(directory, part);
    await plainDirectory(directory);
  }
  const marker = path.join(directory, 'owner.json');
  let owner;
  try {
    if ((await lstat(marker)).isSymbolicLink()) throw new Error('Marcador simbólico recusado.');
    owner = JSON.parse(await readFile(marker, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    if ((await readdir(directory)).length) {
      throw new Error('Pasta da bancada sem marcador já contém trabalho; preservada.');
    }
    owner = { purpose: PURPOSE, repo_root: root };
    await writeFile(marker, JSON.stringify(owner, null, 2), { flag: 'wx', mode: 0o600 });
  }
  if (owner.purpose !== PURPOSE || owner.repo_root !== root) {
    throw new Error('Marcador da bancada pertence a outra worktree.');
  }
  return directory;
}

export async function writeJsonAtomic(file, value) {
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, file);
}

export async function readContext(repoRoot) {
  const evidenceDir = await ensureOwnedWorkspace(repoRoot);
  const state = JSON.parse(await readFile(path.join(evidenceDir, 'database.json'), 'utf8'));
  assertLocalDatabaseUrl(state.database_url);
  return { repoRoot: await realpath(repoRoot), evidenceDir, databaseUrl: state.database_url };
}

/** A porta local também precisa pertencer ao cluster criado por esta worktree. */
export async function assertBenchDatabase(context) {
  const expected = await readContext(context.repoRoot);
  if (context.databaseUrl !== expected.databaseUrl
    || path.resolve(context.evidenceDir) !== expected.evidenceDir) {
    throw new Error('Contexto diferente do marcador da bancada; conexão recusada.');
  }
  const state = JSON.parse(await readFile(path.join(expected.evidenceDir, 'database.json'), 'utf8'));
  const client = new pg.Client({
    connectionString: assertLocalDatabaseUrl(context.databaseUrl),
    connectionTimeoutMillis: 3000, query_timeout: 5000, ssl: false,
  });
  try {
    await client.connect();
    const result = await client.query(`select current_database() as name,
      current_user as owner, current_setting('data_directory') as directory,
      system_identifier::text as identity from pg_control_system()`);
    const server = result.rows[0];
    if (server.name !== 'extensions_bench' || server.owner !== 'extensions_bench_owner'
      || server.directory !== path.join(expected.evidenceDir, 'postgres')
      || server.identity !== state.system_identifier) {
      throw new Error('Servidor não corresponde ao cluster exclusivo da bancada.');
    }
  } finally {
    await client.end();
  }
}

export function childEnvironment() {
  return { PATH: process.env.PATH ?? '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C' };
}
