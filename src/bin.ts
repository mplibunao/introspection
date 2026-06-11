import { runCli } from './commands/index.js';

const userArgOffset = 2;
const result = await runCli({ args: process.argv.slice(userArgOffset), cwd: process.cwd() });

if (result.stdout.length > 0) {
  process.stdout.write(result.stdout);
}

if (result.stderr.length > 0) {
  process.stderr.write(result.stderr);
}

process.exitCode = result.exitCode;
