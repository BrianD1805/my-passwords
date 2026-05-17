export async function handler() {
  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    body: JSON.stringify({
      ok: true,
      app: 'My Passwords',
      version: 'My Passwords Ver-0.002G',
      mode: 'pwa-foundation-with-bootstrap-fix'
    }, null, 2)
  };
}
