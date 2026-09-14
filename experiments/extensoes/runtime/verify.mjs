import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runProbe } from './probe.mjs';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const evidenceDir = resolve(process.argv[2] ?? join(repoRoot, '.superpowers/evidence/extensoes-bancada'));
const report = await runProbe({ repoRoot, evidenceDir });
await mkdir(evidenceDir, { recursive: true });
await writeFile(join(evidenceDir, 'runtime-report.json'), `${JSON.stringify(report, null, 2)}\n`);
assert.equal(report.id, 'runtime');
assert.equal(report.status, 'passed', JSON.stringify(report.checks.filter((check) => !check.passed)));
for (const id of ['valid', 'cross_org', 'missing_grant', 'filesystem', 'network', 'fuel', 'memory_initial', 'memory',
  'output', 'output_cumulative', 'output_at_limit', 'host_timeout', 'bounded_concurrency', 'version']) {
  assert.ok(report.checks.some((check) => check.id === id && check.passed), id);
}
assert.equal(report.measurements.cold_process_ms.n, 5);
assert.equal(report.measurements.warm_call_ms.n, 50);
assert.equal(report.measurements.concurrent.tasks, 8);
assert.equal(report.measurements.concurrent.maximum_active, 2);
assert.equal(report.measurements.container_comparison.status, 'blocked');
const absent = await runProbe({ repoRoot, evidenceDir: join(evidenceDir, 'intentionally-absent') });
assert.equal(absent.status, 'blocked');
assert.equal(absent.checks.length, 0);
process.stdout.write(`${JSON.stringify({ status: report.status, checks: report.checks.length, evidence: join(evidenceDir, 'runtime-report.json') })}\n`);
