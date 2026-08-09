import { config } from '../config';

type LogMeta = Record<string, unknown>;

// Formatea los metadatos de forma segura para desarrollo
function formatMeta(meta?: LogMeta): string {
  if (!meta || Object.keys(meta).length === 0) return '';
  try {
    return ` ${JSON.stringify(meta)}`;
  } catch {
    return ' [Error serializando meta]';
  }
}

// Función base que procesa los logs según el entorno
function log(level: 'INFO' | 'WARN' | 'ERROR', msg: string, meta?: LogMeta): void {
  const ts = new Date().toISOString();

  if (config.isProd) {
    const jsonOutput = JSON.stringify({ level, msg, ...meta, ts });
    if (level === 'ERROR') console.error(jsonOutput);
    else if (level === 'WARN') console.warn(jsonOutput);
    else console.log(jsonOutput);
  } else {
    const textOutput = `[${level}] ${ts} ${msg}${formatMeta(meta)}`;
    if (level === 'ERROR') console.error(textOutput);
    else if (level === 'WARN') console.warn(textOutput);
    else console.log(textOutput);
  }
}

export const logger = {
  info: (msg: string, meta?: LogMeta) => log('INFO', msg, meta),
  warn: (msg: string, meta?: LogMeta) => log('WARN', msg, meta),
  error: (msg: string, meta?: LogMeta) => log('ERROR', msg, meta),
};