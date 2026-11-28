import fs from 'node:fs';
const dir = process.argv[2];
const URL = process.env.SB_URL || 'https://ihrrgmmsfuvlasmzdmwf.supabase.co';
const AK = fs.readFileSync(dir + '/anon.key', 'utf8').trim();
const PW = 'Lt-Senha-forte-2026!';
const file = dir + '/people.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const todo = data.people.filter((p) => p.id);
let k = 0, ok = 0, fail = 0;
await Promise.all(Array.from({ length: 8 }, async () => {
  while (k < todo.length) {
    const p = todo[k++];
    for (let a = 0; a < 8; a++) {
      const r = await fetch(URL + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: AK, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: p.email, password: PW }) });
      if (r.ok) { p.token = (await r.json()).access_token; ok++; break; }
      if (a === 7) { fail++; delete p.token; }
      await new Promise((s) => setTimeout(s, 3000 * (a + 1)));
    }
  }
}));
fs.writeFileSync(file, JSON.stringify(data));
console.log('relogin ok', ok, 'fail', fail);
