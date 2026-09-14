import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { assertLocalDatabaseUrl, ensureOwnedWorkspace } from './common.mjs';

test('recusa destino remoto e parâmetros que redirecionariam a conexão', () => {
  for (const url of [
    'postgresql://extensions_bench_owner@db.example.com:5432/extensions_bench',
    'postgresql://extensions_bench_owner@127.0.0.1:5432/production',
    'postgresql://extensions_bench_owner@127.0.0.1:5432/extensions_bench?host=db.example.com',
    'postgresql://postgres@127.0.0.1:5432/extensions_bench',
    'postgresql://extensions_bench_owner:secret@127.0.0.1:5432/extensions_bench',
  ]) assert.throws(() => assertLocalDatabaseUrl(url), /bancada/);
  assert.doesNotThrow(() => assertLocalDatabaseUrl(
    'postgresql://extensions_bench_owner@127.0.0.1:54383/extensions_bench',
  ));
});

test('recusa ocupar uma pasta que já contém trabalho sem marcador', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'extensions-owner-test-'));
  try {
    const evidence = path.join(root, '.superpowers/evidence/extensoes-bancada');
    await mkdir(evidence, { recursive: true });
    await writeFile(path.join(evidence, 'trabalho-de-outra-sessao.txt'), 'preservar');
    await assert.rejects(ensureOwnedWorkspace(root), /sem marcador/);
  } finally {
    await rm(root, { recursive: true });
  }
});

test('marcador identifica a worktree e permite retomar somente a própria bancada', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'extensions-owner-test-'));
  try {
    const evidence = await ensureOwnedWorkspace(root);
    assert.equal(await ensureOwnedWorkspace(root), evidence);
    await writeFile(path.join(evidence, 'owner.json'), JSON.stringify({
      purpose: 'extensions-architecture-bench', repo_root: '/another/worktree',
    }));
    await assert.rejects(ensureOwnedWorkspace(root), /outra worktree/);
  } finally {
    await rm(root, { recursive: true });
  }
});
