// @ts-check
// Refuses requests a browser was tricked into sending. The control surface has no login (ADR 0008), so two attacks
// from an ordinary web page matter:
// - Cross-site requests: a page on another site can make a visiting browser send a simple POST here (CORS only hides
//   the answer, it does not stop the request). Changes are only taken from this app's own pages: a request that says
//   where it comes from (Origin, or Sec-Fetch-Site) must come from a trusted origin. Tools such as curl send neither.
// - DNS rebinding: a site can point its own name at this computer's address and then read the API as if it were the
//   same site. The Host a request is addressed to must be this computer (an IP address, localhost, or a name of a
//   trusted origin), never someone else's name.
import { isIP } from 'node:net';

import { httpError } from '../utils/httpError.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * @param {string} host a Host header value or a URL host, with or without a port
 * @returns {string} the name or address alone, lower case, without IPv6 brackets
 */
export function hostnameOf(host) {
  const trimmed = host.trim().toLowerCase();
  if (trimmed.startsWith('[')) {
    return trimmed.slice(1, trimmed.indexOf(']'));
  }
  // A bare IPv6 address has several colons and no port.
  return trimmed.split(':').length > 2 ? trimmed : trimmed.split(':')[0];
}

/**
 * @param {string[]} allowedOrigins the browser pages trusted to use the app (see config.js)
 * @returns {import('express').RequestHandler}
 */
export function trustedRequest(allowedOrigins) {
  const origins = new Set(allowedOrigins);
  const names = new Set(['localhost']);
  for (const origin of allowedOrigins) {
    try {
      names.add(hostnameOf(new URL(origin).host));
    } catch {
      // A listed origin that is not a URL cannot match any request; config validation reports it elsewhere.
    }
  }
  const isOwnHost = (/** @type {string} */ host) => {
    const name = hostnameOf(host);
    return isIP(name) !== 0 || names.has(name) || name.endsWith('.localhost');
  };

  return (req, _res, next) => {
    const host = req.headers.host;
    if (host && !isOwnHost(host)) {
      next(httpError(403, 'Open the app at this computer’s address or name, for example localhost.'));
      return;
    }
    if (!SAFE_METHODS.has(req.method)) {
      const origin = req.headers.origin;
      const site = req.headers['sec-fetch-site'];
      const isForeign = origin ? !origins.has(origin) : site === 'cross-site' || site === 'same-site';
      if (isForeign) {
        next(httpError(403, 'Changes are only accepted from this app’s own pages.'));
        return;
      }
    }
    next();
  };
}
