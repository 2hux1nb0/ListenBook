// Cloudflare Pages middleware guarding /studio/*
// Verifies the gate cookie locally (HMAC-SHA256) - no backend call needed.

const COOKIE_NAME = 'lb_gate';

function enc(s) {
  return new TextEncoder().encode(s);
}

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw', enc(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function readCookie(header, name) {
  if (!header) return '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return '';
}

async function valid(token, secret) {
  if (!token || !secret) return false;
  const dot = token.lastIndexOf('.');
  if (dot < 1) return false;
  const exp = Number(token.slice(0, dot));
  const sig = token.slice(dot + 1);
  if (!Number.isFinite(exp) || exp <= Date.now()) return false;
  const want = await hmacHex(secret, String(exp));
  if (want.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const token = readCookie(request.headers.get('Cookie') || '', COOKIE_NAME);
  if (await valid(token, env.GATE_SECRET)) return next();

  const url = new URL(request.url);
  const target = url.pathname + url.search;
  return Response.redirect(url.origin + '/gate?next=' + encodeURIComponent(target), 302);
}
