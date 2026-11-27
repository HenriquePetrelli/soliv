import fs from 'node:fs';
const dir = process.argv[2];
const { run, people } = JSON.parse(fs.readFileSync(dir + '/people.json', 'utf8'));
const psi = people.filter((p) => p.kind === 'psychologist' && p.token);
const pac = people.filter((p) => p.kind === 'patient' && p.token);
const uuid = () => crypto.randomUUID();
const q = (s) => `'${s}'`;
const calls = [], queue = [], waiting = [], browse = [];
const sql = ['BEGIN;'];
sql.push(`INSERT INTO public.psychologists (user_id, full_name, email, crp_number, approved, approval_status) VALUES ` +
  psi.map((p) => `(${q(p.id)}, 'Teste de carga Psi ${p.i}', ${q(p.email)}, '06/LT${p.i}${run}', true, 'approved')`).join(',') + ';');
const NC = Math.min(300, psi.length - 150, pac.length - 450);
for (let k = 0; k < NC; k++) {
  const s = uuid();
  calls.push({ session: s, patient: { id: pac[k].id, token: pac[k].token }, psychologist: { id: psi[k].id, token: psi[k].token } });
}
sql.push(`INSERT INTO public.webrtc_sessions (id, patient_id, psychologist_id, status, expires_at) VALUES ` +
  calls.map((c) => `(${q(c.session)}, ${q(c.patient.id)}, ${q(c.psychologist.id)}, 'active', now() + interval '1 day')`).join(',') + ';');
const qpsi = psi.slice(NC, NC + 150).map((p) => ({ id: p.id, token: p.token, convs: [] }));
const bpac = pac.slice(NC, NC + 250);
const convRows = bpac.map((p, j) => { const c = uuid(); const owner = qpsi[j % qpsi.length]; owner.convs.push(c); browse.push({ id: p.id, token: p.token, conv: c }); return `(${q(c)}, ${q(p.id)}, ${q(owner.id)}, 'ativa')`; });
sql.push(`INSERT INTO public.conversas (id, paciente_id, psicologo_id, status) VALUES ${convRows.join(',')};`);
queue.push(...qpsi);
const wpac = pac.slice(NC + 250, NC + 450);
const reqRows = wpac.map((p) => { const r = uuid(); waiting.push({ id: p.id, token: p.token, request: r }); return `(${q(r)}, ${q(p.id)}, 'cancelled', now(), 'cancelled_by_patient')`; });
sql.push(`INSERT INTO public.emergency_requests (id, patient_id, status, ended_at, end_reason) VALUES ${reqRows.join(',')};`);
sql.push('COMMIT;');
fs.writeFileSync(dir + '/world.sql', sql.join('\n'));
const all = [...psi.map((p) => ({ id: p.id, token: p.token, kind: 'psychologist' })), ...pac.map((p) => ({ id: p.id, token: p.token, kind: 'patient' }))];
fs.writeFileSync(dir + '/world.json', JSON.stringify({ run, calls, queue, waiting, browse, all }));
console.log({ calls: calls.length, queue: queue.length, waiting: waiting.length, browse: browse.length, all: all.length });
