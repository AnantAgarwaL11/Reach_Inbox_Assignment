import winston from 'winston';
import { env } from '../config/env';

const { combine, timestamp, errors, json, colorize, printf } = winston.format;

/**
 * Serialize a metadata value so Error objects produce readable output.
 * JSON.stringify(new Error('x')) yields "{}" because Error properties are
 * non-enumerable.  This helper converts Error instances to a plain object
 * containing name, message, code and stack before serialisation.
 */
function serializeMeta(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      code: (value as any).code,
      stack: value.stack,
    };
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = serializeMeta(v);
    }
    return out;
  }
  return value;
}

// Development: human-readable coloured output
const devFormat = combine(
  colorize({ all: true }),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp, ...meta }) => {
    const serialized = serializeMeta(meta);
    const metaStr =
      Object.keys(meta).length ? ` ${JSON.stringify(serialized)}` : '';
    return `${timestamp} [${level}] ${message}${metaStr}`;
  })
);

// Production: machine-parseable JSON
const prodFormat = combine(timestamp(), errors({ stack: true }), json());

export const logger = winston.createLogger({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: env.NODE_ENV === 'production' ? prodFormat : devFormat,
  transports: [new winston.transports.Console()],
});
