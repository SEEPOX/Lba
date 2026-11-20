const $ = id => document.getElementById(id);
const KEY = 'lba-chats-v1';
let chats = [], cur = null, busy = false, abort = null;

try { chats = JSON.parse(localStorage.getItem(KEY)) || []; } catch { chats = []; }
const save = () => localStorage.setItem(KEY, JSON.stringify(chats));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const get = () => chats.find(c => c.id === cur);

function esc(s){return s.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));}
function md(t){ // tiny, safe markdown: code blocks, inline code, bold
  return esc(t)
    .replace(/```(?:\w+)?\n?([\s\S]*?)```/g,'<pre><code>$1</code></pre>')
    .replace(/`([^`\n]+)`/g,'<code>$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>');
}

function renderList(){
  $('chatList').innerHTML = '';
  chats.forEach(c => {
    const d = document.createElement('div');
    d.className = 'item' + (c.id === cur ? ' active' : '');
    d.innerHTML = `<span>${esc(c.title)}</span><b title="Delete">✕</b>`;
    d.onclick = () => { cur = c.id; $('sidebar').classList.remove('open'); render(); };
    d.querySelector('b').onclick = e => {
      e.stopPropagation();
      chats = chats.filter(x => x.id !== c.id);
      if (cur === c.id) cur = null;
      save(); render();
    };
    $('chatList').appendChild(d);
  });
}

function render(){
  renderList();
  const c = get(), box = $('messages');
  $('title').textContent = c ? c.title : 'New chat';
  box.innerHTML = '';
  if (!c || !c.messages.length){
    box.innerHTML = '<div class="empty"><h1>LBA Chat</h1><p>Ask anything to get started.</p></div>';
    return;
  }
  c.messages.forEach(m => addMsg(m.role, m.content));
  box.scrollTop = box.scrollHeight;
}

function addMsg(role, text){
  const d = document.createElement('div');
  d.className = 'msg ' + role;
  d.innerHTML = md(text);
  $('messages').appendChild(d);
  return d;
}

async function send(text){
  if (busy || !text.trim()) return;
  let c = get();
  if (!c){
    c = { id: uid(), title: text.slice(0, 40), messages: [] };
    chats.unshift(c); cur = c.id;
  }
  c.messages.push({ role: 'user', content: text });
  save(); render();
  const out = addMsg('assistant', '…');
  busy = true; $('send').disabled = true;
  abort = new AbortController();
  let reply = '';
  try {
    const res = await fetch('/api/chat', {
      method: 'POST', signal: abort.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: c.messages.slice(-20) })
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error || 'Server error ' + res.status);
    }
    const reader = res.body.getReader(), dec = new TextDecoder();
    let buf = '';
    for (;;){
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n'); buf = lines.pop();
      for (const l of lines){
        if (!l.startsWith('data:')) continue;
        const p = l.slice(5).trim();
        if (p === '[DONE]') continue;
        try {
          const t = JSON.parse(p).choices?.[0]?.delta?.content;
          if (t){ reply += t; out.innerHTML = md(reply); $('messages').scrollTop = 1e9; }
        } catch {}
      }
    }
    if (!reply) throw new Error('Empty reply. Please try again.');
  } catch (e) {
    if (e.name !== 'AbortError') out.innerHTML = md((reply ? reply + '\n\n' : '') + '⚠️ ' + e.message);
  }
  if (reply) c.messages.push({ role: 'assistant', content: reply });
  save(); busy = false; $('send').disabled = false; renderList();
}

$('form').onsubmit = e => { e.preventDefault(); const t = $('input').value; $('input').value = ''; $('input').style.height = 'auto'; send(t); };
$('input').onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); $('form').requestSubmit(); } };
$('input').oninput = e => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; };
$('newChat').onclick = () => { cur = null; $('sidebar').classList.remove('open'); render(); $('input').focus(); };
$('menu').onclick = () => $('sidebar').classList.toggle('open');
$('clearAll').onclick = () => { if (confirm('Delete all chats?')){ chats = []; cur = null; save(); render(); } };
render();
