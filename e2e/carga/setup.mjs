import fs from 'node:fs';
const dir = process.argv[2];
const URL = 'https://ihrrgmmsfuvlasmzdmwf.supabase.co';
const SK = fs.readFileSync(dir + '/service.key', 'utf8').trim();
const AK = fs.readFileSync(dir + '/anon.key', 'utf8').trim();
const code = fs.readFileSync(dir + '/invite.txt', 'utf8').trim();
const PW = 'Lt-Senha-forte-2026!';
const N_PSI = 450, N_PAC = 750;
const run = Date.now().toString(36);
const people = [
  ...Array.from({ length: N_PSI }, (_, i) => ({ kind: 'psychologist', i, email: `psi${i}-${run}@loadtest.invalid` })),
  ...Array.from({ length: N_PAC }, (_, i) => ({ kind: 'patient', i, email: `pac${i}-${run}@loadtest.invalid` })),
];
const mapLimit = async (items, n, fn) => { let k = 0; await Promise.all(Array.from({ length: n }, async () => { while (k < items.length) { const it = items[k++]; await fn(it); } })); };
let fails = 0;
await mapLimit(people, 12, async (p) => {
  for (let a = 0; a < 4; a++) {
    const r = await fetch(URL + '/auth/v1/admin/users', { method: 'POST', headers: { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: p.email, password: PW, email_confirm: true, user_metadata: { user_type: p.kind, full_name: `Teste de carga ${p.kind === 'psychologist' ? 'Psi' : 'Pac'} ${p.i}`, signup_invite_code: code || undefined } }) });
    if (r.ok) { p.id = (await r.json()).id; break; }
    if (a === 3) { fails++; console.log('create fail', r.status, (await r.text()).slice(0, 120)); }
    await new Promise((s) => setTimeout(s, 500 * (a + 1)));
  }
  if (!p.id) return;
  for (let a = 0; a < 4; a++) {
    const r = await fetch(URL + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: AK, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: p.email, password: PW }) });
    if (r.ok) { p.token = (await r.json()).access_token; break; }
    if (a === 3) { fails++; console.log('login fail', r.status, (await r.text()).slice(0, 120)); }
    await new Promise((s) => setTimeout(s, 1000 * (a + 1)));
  }
});
fs.writeFileSync(dir + '/people.json', JSON.stringify({ run, people }));
console.log('run', run, 'ok', people.filter((p) => p.token).length, 'fails', fails);
