/*
 * Public CLI entry. IX-SR-02 replaced the hand-rolled command dispatcher with
 * an Effect-native shell under `src/cli`; this module now re-exports the
 * `runCli` adapter so existing callers (bin wiring, tests, fixtures) keep a
 * stable import path.
 */
export { runCli } from '../cli/run.js';
