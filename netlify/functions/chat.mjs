// Server-side proxy: API key browser tak kabhi nahi jaati.
export default async (req) => {
  const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const key = Netlify.env.get('OPENROUTER_API_KEY');
  if (!key) return json({ error: 'OPENROUTER_API_KEY Netlify me set nahi hai.' }, 500);

  let messages;
  try { ({ messages } = await req.json()); } catch { return json({ error: 'Bad request' }, 400); }
  if (!Array.isArray(messages) || !messages.length) return json({ error: 'No messages' }, 400);

  const model = Netlify.env.get('OPENROUTER_MODEL') || 'openrouter/free';
  const up = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model, stream: true,
      messages: [{ role: 'system', content: 'You are LBA Chat, a helpful, concise AI assistant.' }, ...messages.slice(-20)]
    }),
    signal: AbortSignal.timeout(50000)
  }).catch(() => null);

  if (!up) return json({ error: 'AI provider timeout. Dobara try karo.' }, 504);
  if (!up.ok) return json({ error: up.status === 429 ? 'Free model busy hai (rate limit). Thodi der baad try karo.' : 'AI provider error ' + up.status }, 502);
  return new Response(up.body, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
};
export const config = { path: '/api/chat' };
