// Cloudflare Pages Function: /gate-out
// Clears the admin gate cookie and sends the visitor back to the login page.

const COOKIE_NAME = 'lb_gate';

export async function onRequestGet(context) {
  const origin = new URL(context.request.url).origin;
  return new Response(null, {
    status: 302,
    headers: {
      'Location': origin + '/gate',
      'Set-Cookie': COOKIE_NAME + '=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax',
      'Cache-Control': 'no-store',
    },
  });
}
