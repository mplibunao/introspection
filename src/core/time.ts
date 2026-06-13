/*
 * Seconds-precision ISO timestamp: strips the milliseconds component so that
 * generated-at fields in orientation and record-list output are not spuriously
 * different across sub-millisecond runs.
 */
const isoTimestamp = (date: Date): string => date.toISOString().replace(/\.\d{3}Z$/u, 'Z');

export { isoTimestamp };
