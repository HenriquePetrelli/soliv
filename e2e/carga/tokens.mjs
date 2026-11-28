// Troca os tokens do world.json pelos do people.json (depois de um novo login).
import fs from 'node:fs';
const dir = process.argv[2];
const tok = new Map(JSON.parse(fs.readFileSync(dir + '/people.json', 'utf8')).people.filter((p) => p.token).map((p) => [p.id, p.token]));
const w = JSON.parse(fs.readFileSync(dir + '/world.json', 'utf8'));
const fix = (o) => { if (o && o.id && tok.has(o.id)) o.token = tok.get(o.id); };
w.calls.forEach((c) => { fix(c.patient); fix(c.psychologist); });
[w.queue, w.waiting, w.browse, w.all].forEach((list) => list.forEach(fix));
fs.writeFileSync(dir + '/world.json', JSON.stringify(w));
console.log('tokens atualizados', tok.size);
