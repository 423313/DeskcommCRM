import { execFile } from 'node:child_process';
import { access, lstat, readFile, realpath } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import pg from 'pg';
import { assertBenchDatabase, childEnvironment, ensureOwnedWorkspace, readContext, writeJsonAtomic } from './common.mjs';

const execute = promisify(execFile);
const repoRoot = await realpath(fileURLToPath(new URL('../../', import.meta.url)));
const evidenceDir = await ensureOwnedWorkspace(repoRoot);
const dataDir = path.join(evidenceDir, 'postgres');
const stateFile = path.join(evidenceDir, 'database.json');
const pgBin = process.env.EXTENSIONS_BENCH_PG_BIN ?? '/opt/homebrew/opt/postgresql@16/bin';

async function exists(file) {
  try { await access(file); return true; } catch { return false; }
}

async function run(binary, args) {
  return execute(path.join(pgBin, binary), args, {
    env: childEnvironment(), timeout: 25000, maxBuffer: 1024 * 1024,
  });
}

function quote(value) { return `'${value.replaceAll("'", "'\\''")}'`; }

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function rejectLinkedChild(directory) {
  if (await exists(directory)) {
    const info = await lstat(directory);
    if (info.isSymbolicLink() || !info.isDirectory()) throw new Error('Diretório do cluster inválido.');
  }
}

async function running() {
  if (!await exists(path.join(dataDir, 'PG_VERSION'))) return false;
  try { await run('pg_ctl', ['-D', dataDir, 'status']); return true; }
  catch (error) { if (error.code === 3) return false; throw error; }
}

async function start() {
  if (await running()) {
    const context = await readContext(repoRoot);
    await assertBenchDatabase(context);
    return { state: 'running', database_url: context.databaseUrl, resumed: true };
  }
  await rejectLinkedChild(dataDir);
  if (!await exists(path.join(dataDir, 'PG_VERSION'))) {
    await run('initdb', ['-D', dataDir, '-U', 'extensions_bench_owner',
      '--auth-local=trust', '--auth-host=trust', '--encoding=UTF8', '--locale=C']);
  }
  const previous = await exists(stateFile) ? JSON.parse(await readFile(stateFile, 'utf8')) : null;
  const port = previous ? Number(new URL(previous.database_url).port) : await freePort();
  // TCP exclusivo evita o limite de 103 bytes de sockets Unix em worktrees longas no macOS.
  const options = ['-h', '127.0.0.1', '-p', String(port), '-k', '',
    '-c', 'fsync=on', '-c', 'synchronous_commit=on', '-c', 'max_connections=30']
    .map(quote).join(' ');
  await run('pg_ctl', ['-D', dataDir, '-l', path.join(evidenceDir, 'postgres.log'),
    '-o', options, '-w', '-t', '15', 'start']);
  const client = new pg.Client({ host: '127.0.0.1', port, database: 'postgres',
    user: 'extensions_bench_owner', ssl: false, connectionTimeoutMillis: 3000 });
  try {
    await client.connect();
    const info = (await client.query(`select current_setting('data_directory') as directory,
      version() as version, system_identifier::text as identity from pg_control_system()`)).rows[0];
    if (info.directory !== dataDir) throw new Error('A porta não pertence ao cluster criado.');
    if (previous && info.identity !== previous.system_identifier) throw new Error('Identidade do cluster mudou.');
    if (!(await client.query("select 1 from pg_database where datname = 'extensions_bench'")).rowCount) {
      await client.query('create database extensions_bench');
    }
    const state = {
      database_url: `postgresql://extensions_bench_owner@127.0.0.1:${port}/extensions_bench`,
      system_identifier: info.identity, version: info.version,
      scope: 'isolated_native_experiment_not_supabase_pg15',
    };
    await writeJsonAtomic(stateFile, state);
    return { state: 'running', ...state };
  } finally { await client.end(); }
}

try {
  await rejectLinkedChild(dataDir);
  const command = process.argv[2] ?? 'status';
  let result;
  if (command === 'start') result = await start();
  else if (command === 'status') {
    const active = await running();
    if (active) await assertBenchDatabase(await readContext(repoRoot));
    result = { state: active ? 'running' : 'stopped' };
  } else if (command === 'stop') {
    if (await running()) {
      await assertBenchDatabase(await readContext(repoRoot));
      await run('pg_ctl', ['-D', dataDir, '-w', '-t', '15', '-m', 'fast', 'stop']);
    }
    result = { state: 'stopped', data_preserved: true };
  } else throw new Error('Use start, status ou stop.');
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`Bancada: ${error.message}\n`);
  process.exitCode = 1;
}
