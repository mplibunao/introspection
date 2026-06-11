import type { ErrorDetails } from '../core/errors.js';

interface CliRunOptions {
  readonly args: ReadonlyArray<string>;
  readonly cwd?: string;
  readonly now?: () => Date;
}

interface CliRunResult {
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdout: string;
}

interface CliCommandContext {
  readonly cwd?: string;
  readonly json: boolean;
  readonly now: () => Date;
}

interface CommandRequest {
  readonly args: ReadonlyArray<string>;
  readonly context: CliCommandContext;
}

interface CliErrorPayload {
  readonly code: string;
  readonly message: string;
  readonly details?: ErrorDetails;
}

interface CommandSuccess {
  readonly exitCode?: number;
  readonly stderr?: string;
  readonly stdout: string;
}

interface CommandFailure {
  readonly error: CliErrorPayload;
  readonly exitCode?: number;
}

type CommandOutcome = CommandFailure | CommandSuccess;

type CommandHandler = (request: CommandRequest) => Promise<CommandOutcome>;

export type {
  CliCommandContext,
  CliErrorPayload,
  CliRunOptions,
  CliRunResult,
  CommandFailure,
  CommandHandler,
  CommandOutcome,
  CommandRequest,
  CommandSuccess,
};
