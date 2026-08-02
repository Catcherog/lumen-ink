import cors from 'cors';
import type { ErrorRequestHandler, RequestHandler } from 'express';

export interface CorsEnvironment {
  CORS_ALLOWLIST?: string;
  VERCEL_URL?: string;
  VERCEL_BRANCH_URL?: string;
  VERCEL_PROJECT_PRODUCTION_URL?: string;
}

const FIXED_ORIGINS = ['https://lumen-ink.vercel.app'];

interface ParsedOrigin {
  protocol: string;
  hostname: string;
  port: string;
  hasExplicitPort: boolean;
  explicitPort: string | null;
}

/**
 * Validate one exact origin with WHATWG URL parsing.
 *
 * The explicit-port bit is retained because WHATWG normalizes :443/:80 away
 * from URL.port. A Preview origin with an explicit port must not match the
 * same hostname without that port.
 */
function parseOrigin(value: string): ParsedOrigin | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (!url.hostname || url.hostname.endsWith('.')) return null;
  if (url.username || url.password) return null;
  if (url.pathname !== '/' || url.search || url.hash) return null;

  const schemeEnd = trimmed.indexOf('://');
  if (schemeEnd < 0) return null;
  const authorityStart = schemeEnd + 3;
  const remainder = trimmed.slice(authorityStart);
  const authorityEnd = remainder.search(/[/?#]/);
  const authority = authorityEnd < 0 ? remainder : remainder.slice(0, authorityEnd);
  if (!authority || authority.includes('@')) return null;

  let hasExplicitPort = false;
  let explicitPort = '';
  if (authority.startsWith('[')) {
    const closingBracket = authority.indexOf(']');
    if (closingBracket < 0) return null;
    const suffix = authority.slice(closingBracket + 1);
    if (suffix && !suffix.startsWith(':')) return null;
    hasExplicitPort = suffix.length > 0;
    explicitPort = suffix.slice(1);
  } else {
    const colonIndex = authority.lastIndexOf(':');
    hasExplicitPort = colonIndex >= 0;
    explicitPort = hasExplicitPort ? authority.slice(colonIndex + 1) : '';
  }

  if (hasExplicitPort && !/^\d+$/.test(explicitPort)) return null;

  return {
    protocol: url.protocol,
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? '443' : '80'),
    hasExplicitPort,
    explicitPort: hasExplicitPort ? explicitPort : null,
  };
}

function parseConfiguredOrigins(raw: string | undefined): ParsedOrigin[] {
  return (raw ?? '')
    .split(',')
    .map((value) => parseOrigin(value))
    .filter((value): value is ParsedOrigin => value !== null);
}

function parseVercelOrigin(value: string | undefined): ParsedOrigin | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const originValue = trimmed.includes('://') ? trimmed : `https://${trimmed}`;
  const parsed = parseOrigin(originValue);
  if (!parsed || parsed.protocol !== 'https:' || parsed.hasExplicitPort) return null;
  return parsed;
}

function originsMatch(candidate: ParsedOrigin, allowed: ParsedOrigin): boolean {
  return (
    candidate.protocol === allowed.protocol &&
    candidate.hostname === allowed.hostname &&
    candidate.port === allowed.port &&
    candidate.hasExplicitPort === allowed.hasExplicitPort &&
    candidate.explicitPort === allowed.explicitPort
  );
}

/**
 * Return whether an Origin is one of the exact configured project origins.
 *
 * Vercel values are added as individual origins only. This intentionally does
 * not use a wildcard or a generic *.vercel.app rule.
 */
export function isAllowedOrigin(
  origin: string | undefined,
  env: CorsEnvironment
): boolean {
  if (!origin) return true;
  const candidate = parseOrigin(origin);
  if (!candidate) return false;

  const allowed = FIXED_ORIGINS.map((value) => parseOrigin(value))
    .concat(parseConfiguredOrigins(env.CORS_ALLOWLIST))
    .filter((value): value is ParsedOrigin => value !== null);

  for (const value of [
    env.VERCEL_URL,
    env.VERCEL_BRANCH_URL,
    env.VERCEL_PROJECT_PRODUCTION_URL,
  ]) {
    const parsed = parseVercelOrigin(value);
    if (parsed) allowed.push(parsed);
  }

  return allowed.some((allowedOrigin) => originsMatch(candidate, allowedOrigin));
}

export const CORS_ORIGIN_NOT_ALLOWED = 'CORS_ORIGIN_NOT_ALLOWED';

class CorsOriginError extends Error {
  readonly code = CORS_ORIGIN_NOT_ALLOWED;

  constructor() {
    super(CORS_ORIGIN_NOT_ALLOWED);
    this.name = 'CorsOriginError';
  }
}

export function createCorsMiddleware(env: CorsEnvironment): RequestHandler {
  return cors({
    origin(origin, callback) {
      if (isAllowedOrigin(origin, env)) {
        callback(null, true);
        return;
      }
      callback(new CorsOriginError());
    },
    credentials: false,
  });
}

export function createCorsErrorHandler(): ErrorRequestHandler {
  return (err, _req, res, next) => {
    if (
      err instanceof CorsOriginError ||
      (typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        err.code === CORS_ORIGIN_NOT_ALLOWED)
    ) {
      res.status(403).json({ error: CORS_ORIGIN_NOT_ALLOWED });
      return;
    }
    next(err);
  };
}
