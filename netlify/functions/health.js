export default async () => {
  return new Response(JSON.stringify({
    ok: true,
    app: 'My Passwords',
    version: 'Ver-0.001',
    note: 'Netlify Functions are wired. Database save/sync will be added after Netlify Database is provisioned.'
  }), {
    headers: { 'content-type': 'application/json' }
  });
};
