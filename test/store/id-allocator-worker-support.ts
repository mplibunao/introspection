import { spawn } from 'node:child_process';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '../..');

interface WorkerRequest {
  readonly delayMs?: number;
  readonly locksRoot: string;
  readonly recordsRoot: string;
  readonly staleAfterMs?: number;
  readonly workerId: string;
}

const runAllocatorWorker = async ({
  delayMs = 0,
  locksRoot,
  recordsRoot,
  staleAfterMs = 0,
  workerId,
}: WorkerRequest): Promise<{ readonly stderr: string; readonly stdout: string }> =>
  new Promise((resolve, reject) => {
    const child = spawn(
      'corepack',
      ['pnpm', 'vitest', 'run', 'test/fixtures/id-allocator-worker.test.ts', '--reporter=dot'],
      {
        cwd: projectRoot,
        env: {
          ...process.env,
          INTROSPECTION_ALLOCATOR_WORKER_DELAY_MS: String(delayMs),
          INTROSPECTION_ALLOCATOR_WORKER_ID: workerId,
          INTROSPECTION_ALLOCATOR_WORKER_LOCKS_ROOT: locksRoot,
          INTROSPECTION_ALLOCATOR_WORKER_RECORDS_ROOT: recordsRoot,
          INTROSPECTION_ALLOCATOR_WORKER_STALE_AFTER_MS: String(staleAfterMs),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(
        new Error(
          `Allocator worker ${workerId} failed with code ${code}.\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`,
        ),
      );
    });
  });

export { runAllocatorWorker };
export type { WorkerRequest };
