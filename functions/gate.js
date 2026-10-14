// Cloudflare Pages Function: /gate
// Admin access gate for ListenBook. Shows a login page; on success it sets a
// signed cookie that the /admin and /studio middlewares verify locally.
//
// Required environment variables (set on the Pages project):
//   GATE_PASSWORD - the passphrase the admin types in
//   GATE_SECRET   - random string used to sign the cookie

const COOKIE_NAME = 'lb_gate';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

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

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Only allow same-site relative paths, so ?next= cannot be used as an open redirect.
function safeNext(raw) {
  if (!raw || typeof raw !== 'string') return '/studio/';
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/studio/';
  if (raw.startsWith('/gate')) return '/studio/';
  return raw;
}

function page(next, failed) {
  const errStyle = failed ? 'block' : 'none';
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>访问受限 · ListenBook 后台</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: #0b1020;
    background-image: radial-gradient(circle at 20% 10%, #1b2a55 0%, transparent 55%),
                      radial-gradient(circle at 85% 85%, #2a1b4d 0%, transparent 50%);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
                 "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
    color: #e8ecf6; padding: 24px;
  }
  .card {
    width: 100%; max-width: 380px; padding: 32px 28px;
    background: rgba(20, 27, 48, .82);
    border: 1px solid rgba(255, 255, 255, .09);
    border-radius: 16px;
    box-shadow: 0 24px 60px rgba(0, 0, 0, .5);
    backdrop-filter: blur(12px);
  }
  .lock { width: 44px; height: 44px; display: flex; align-items: center; justify-content: center;
          border-radius: 12px; background: rgba(99, 132, 255, .14);
          border: 1px solid rgba(99, 132, 255, .3); margin-bottom: 18px; font-size: 20px; }
  h1 { margin: 0 0 6px; font-size: 19px; font-weight: 600; letter-spacing: .2px; }
  .sub { margin: 0 0 22px; font-size: 13px; line-height: 1.6; color: #96a2c0; }
  label { display: block; font-size: 12px; color: #96a2c0; margin-bottom: 7px; letter-spacing: .3px; }
  input[type=password] {
    width: 100%; padding: 12px 14px; font-size: 15px; color: #e8ecf6;
    background: rgba(8, 12, 26, .8); border: 1px solid rgba(255, 255, 255, .12);
    border-radius: 10px; outline: none; transition: border-color .15s, box-shadow .15s;
  }
  input[type=password]:focus { border-color: #6384ff; box-shadow: 0 0 0 3px rgba(99, 132, 255, .18); }
  button {
    width: 100%; margin-top: 16px; padding: 12px; font-size: 15px; font-weight: 600;
    color: #fff; background: linear-gradient(135deg, #4f6bff, #7a4dff);
    border: 0; border-radius: 10px; cursor: pointer; transition: filter .15s, transform .05s;
  }
  button:hover { filter: brightness(1.1); }
  button:active { transform: translateY(1px); }
  .err {
    display: ${errStyle}; margin: 14px 0 0; padding: 9px 12px; font-size: 13px;
    color: #ffb4b4; background: rgba(255, 70, 70, .1);
    border: 1px solid rgba(255, 70, 70, .25); border-radius: 8px;
  }
  .foot { margin: 22px 0 0; font-size: 11.5px; line-height: 1.7; color: #6b7690; text-align: center; }
</style>
</head>
<body>
  <form class="card" method="POST" action="/gate">
    <input type="hidden" name="next" value="${next.replace(/"/g, '&quot;')}">
    <div class="lock">&#128274;</div>
    <h1>ListenBook 管理后台</h1>
    <p class="sub">此区域仅限管理员访问，请输入访问口令。</p>
    <p class="err">口令不正确，请重试。</p>
    <label for="pw">访问口令</label>
    <input id="pw" name="password" type="password" placeholder="请输入口令"
           autocomplete="current-password" autofocus required>
    <button type="submit">进入后台</button>
    <p class="foot">验证通过后 30 天内免重复输入</p>
  </form>
</body>
</html>`;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.GATE_PASSWORD || !env.GATE_SECRET) {
    return new Response('gate is not configured', { status: 500 });
  }
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get('next') || '/studio/');
  const failed = url.searchParams.has('e');
  return new Response(page(next, failed), {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.GATE_PASSWORD || !env.GATE_SECRET) {
    return new Response('gate is not configured', { status: 500 });
  }

  let form;
  try {
    form = await request.formData();
  } catch (e) {
    form = null;
  }
  const supplied = form ? String(form.get('password') || '') : '';
  const next = safeNext(form ? String(form.get('next') || '') : '');
  const origin = new URL(request.url).origin;

  if (!safeEqual(supplied, env.GATE_PASSWORD)) {
    return Response.redirect(origin + '/gate?e=1&next=' + encodeURIComponent(next), 302);
  }

  const exp = Date.now() + COOKIE_MAX_AGE * 1000;
  const sig = await hmacHex(env.GATE_SECRET, String(exp));
  const token = exp + '.' + sig;

  return new Response(null, {
    status: 302,
    headers: {
      'Location': origin + next,
      'Set-Cookie': COOKIE_NAME + '=' + token + '; Max-Age=' + COOKIE_MAX_AGE +
                    '; Path=/; HttpOnly; Secure; SameSite=Lax',
      'Cache-Control': 'no-store',
    },
  });
}
