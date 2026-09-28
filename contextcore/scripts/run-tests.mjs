import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const bootstrapPath = fileURLToPath(new URL('./test-bootstrap.cjs', import.meta.url)).replaceAll('\\', '/');
const bootstrapOption = `--require="${bootstrapPath}"`;
const inheritedNodeOptions = process.env.NODE_OPTIONS?.trim();
const env = {
  ...process.env,
  NODE_OPTIONS: [inheritedNodeOptions, bootstrapOption].filter(Boolean).join(' '),
};

const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env,
});

if (result.error) {
  console.error(result.error);
  process.exitCode = 1;
} else {
  process.exitCode = result.status ?? 1;
}
