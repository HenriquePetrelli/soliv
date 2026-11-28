// Teste de carga do Soliv: cada VU é uma pessoa fazendo o que o app faz
// (intervalos iguais aos do código depois das correções de 2026-11-27).
import http from 'k6/http';
import exec from 'k6/execution';
import { sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { Counter, Trend } from 'k6/metrics';
import { WebSocket } from 'k6/experimental/websockets';

const URL = __ENV.SB_URL || 'https://ihrrgmmsfuvlasmzdmwf.supabase.co';
const AK = open('./anon.key').trim();
const data = new SharedArray('data', () => [JSON.parse(open('./world.json'))]);
const W = () => data[0];

const SCALE = Number(__ENV.SCALE || 1); // 1 = pico completo
const HOLD = __ENV.HOLD || '3m';
const MAX = { call: Number(__ENV.MAX_CALL || 514), queue: 150, waiting: 200, browse: 250, rt: Number(__ENV.MAX_RT || 400) };
const stages = (max) => [
  { duration: __ENV.RAMP || '1m', target: Math.round(max * 0.1 * SCALE) },
  { duration: HOLD, target: Math.round(max * 0.1 * SCALE) },
  { duration: __ENV.RAMP || '1m', target: Math.round(max * 0.25 * SCALE) },
  { duration: HOLD, target: Math.round(max * 0.25 * SCALE) },
  { duration: __ENV.RAMP || '1m', target: Math.round(max * 0.5 * SCALE) },
  { duration: HOLD, target: Math.round(max * 0.5 * SCALE) },
  { duration: __ENV.RAMP || '1m', target: Math.round(max * SCALE) },
  { duration: __ENV.LAST_HOLD || '4m', target: Math.round(max * SCALE) },
];
const scenario = (fn, max) => ({ executor: 'ramping-vus', exec: fn, startVUs: 0, stages: stages(max), gracefulRampDown: '0s', gracefulStop: '5s' });

export const options = {
  scenarios: __ENV.ONLY_RT ? { rt: { executor: 'constant-vus', exec: 'rt', vus: Number(__ENV.ONLY_RT), duration: __ENV.RT_DUR || '6m', gracefulStop: '3s' } } : {
    call: scenario('call', MAX.call),
    queue: scenario('queue', MAX.queue),
    waiting: scenario('waiting', MAX.waiting),
    browse: scenario('browse', MAX.browse),
    ...(__ENV.NO_RT ? {} : { rt: scenario('rt', MAX.rt) }),
  },
  thresholds: {
    // Para o teste se mais de 20% dos pedidos falharem (não derrubar a produção à toa).
    http_req_failed: [{ threshold: 'rate<0.2', abortOnFail: true, delayAbortEval: '1m' }],
    'rt_join_fail{kind:pool}': ['count>=0'],
    'rt_system_error{kind:pool}': ['count>=0'],
    'rt_join_fail{kind:timeout}': ['count>=0'],
    'rt_system_error{kind:timeout}': ['count>=0'],
    'rt_join_fail{kind:unauthorized}': ['count>=0'],
    'rt_system_error{kind:unauthorized}': ['count>=0'],
    'rt_join_fail{kind:other}': ['count>=0'],
    'rt_system_error{kind:other}': ['count>=0'],
    'rt_join_fail{kind:socket}': ['count>=0'],
    'rt_system_error{kind:socket}': ['count>=0'],
    'rt_join_ok{topic:account-status}': ['count>=0'],
    'rt_join_ok{topic:notifications}': ['count>=0'],
    'rt_join_ok{topic:conversas}': ['count>=0'],
    'rt_join_ok{topic:sos-queue}': ['count>=0'],
    'rt_join_ok{topic:psi-presence}': ['count>=0'],
    'rt_join_ok{topic:call-room}': ['count>=0'],
    'rt_join_ok{topic:call-presence}': ['count>=0'],
    'rt_broadcast_received{event:changed}': ['count>=0'],
    'http_req_duration{stage:s1}': ['p(95)<600000'],
    'http_req_failed{stage:s1}': ['rate<1'],
    'http_reqs{stage:s1}': ['count>=0'],
    'http_req_duration{stage:s2}': ['p(95)<600000'],
    'http_req_failed{stage:s2}': ['rate<1'],
    'http_reqs{stage:s2}': ['count>=0'],
    'http_req_duration{stage:s3}': ['p(95)<600000'],
    'http_req_failed{stage:s3}': ['rate<1'],
    'http_reqs{stage:s3}': ['count>=0'],
    'http_req_duration{stage:s4}': ['p(95)<600000'],
    'http_req_failed{stage:s4}': ['rate<1'],
    'http_reqs{stage:s4}': ['count>=0'],
    'http_req_duration{name:presence_upsert,stage:s1}': ['p(95)<600000'],
    'http_req_duration{name:presence_upsert,stage:s4}': ['p(95)<600000'],
    'http_req_failed{name:presence_upsert}': ['rate<1'],
    'http_req_duration{name:presence_read,stage:s1}': ['p(95)<600000'],
    'http_req_duration{name:presence_read,stage:s4}': ['p(95)<600000'],
    'http_req_failed{name:presence_read}': ['rate<1'],
    'http_req_duration{name:call_clock,stage:s1}': ['p(95)<600000'],
    'http_req_duration{name:call_clock,stage:s4}': ['p(95)<600000'],
    'http_req_failed{name:call_clock}': ['rate<1'],
    'http_req_duration{name:room_read,stage:s1}': ['p(95)<600000'],
    'http_req_duration{name:room_read,stage:s4}': ['p(95)<600000'],
    'http_req_failed{name:room_read}': ['rate<1'],
    'http_req_duration{name:room_end_reason,stage:s1}': ['p(95)<600000'],
    'http_req_duration{name:room_end_reason,stage:s4}': ['p(95)<600000'],
    'http_req_failed{name:room_end_reason}': ['rate<1'],
    'http_req_duration{name:report_call_media,stage:s1}': ['p(95)<600000'],
    'http_req_duration{name:report_call_media,stage:s4}': ['p(95)<600000'],
    'http_req_failed{name:report_call_media}': ['rate<1'],
    'http_req_duration{name:psi_presence_insert,stage:s1}': ['p(95)<600000'],
    'http_req_duration{name:psi_presence_insert,stage:s4}': ['p(95)<600000'],
    'http_req_failed{name:psi_presence_insert}': ['rate<1'],
    'http_req_duration{name:list_open_emergency_requests,stage:s1}': ['p(95)<600000'],
    'http_req_duration{name:list_open_emergency_requests,stage:s4}': ['p(95)<600000'],
    'http_req_failed{name:list_open_emergency_requests}': ['rate<1'],
    'http_req_duration{name:psi_presence_beat,stage:s1}': ['p(95)<600000'],
    'http_req_duration{name:psi_presence_beat,stage:s4}': ['p(95)<600000'],
    'http_req_failed{name:psi_presence_beat}': ['rate<1'],
    'http_req_duration{name:chat_send,stage:s1}': ['p(95)<600000'],
    'http_req_duration{name:chat_send,stage:s4}': ['p(95)<600000'],
    'http_req_failed{name:chat_send}': ['rate<1'],
    'http_req_duration{name:sos_check,stage:s1}': ['p(95)<600000'],
    'http_req_duration{name:sos_check,stage:s4}': ['p(95)<600000'],
    'http_req_failed{name:sos_check}': ['rate<1'],
    'http_req_duration{name:count_available_psychologists,stage:s1}': ['p(95)<600000'],
    'http_req_duration{name:count_available_psychologists,stage:s4}': ['p(95)<600000'],
    'http_req_failed{name:count_available_psychologists}': ['rate<1'],
    'http_req_duration{name:listar_conversas,stage:s1}': ['p(95)<600000'],
    'http_req_duration{name:listar_conversas,stage:s4}': ['p(95)<600000'],
    'http_req_failed{name:listar_conversas}': ['rate<1'],
    'http_req_duration{name:notifications,stage:s1}': ['p(95)<600000'],
    'http_req_duration{name:notifications,stage:s4}': ['p(95)<600000'],
    'http_req_failed{name:notifications}': ['rate<1'],
    'http_req_duration{name:marcar_mensagens_como_lidas,stage:s1}': ['p(95)<600000'],
    'http_req_duration{name:marcar_mensagens_como_lidas,stage:s4}': ['p(95)<600000'],
    'http_req_failed{name:marcar_mensagens_como_lidas}': ['rate<1'],
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
  discardResponseBodies: true,
};

const rtJoinOk = new Counter('rt_join_ok');
const rtJoinFail = new Counter('rt_join_fail');
const rtBroadcast = new Counter('rt_broadcast_received');
const rtLatency = new Trend('rt_broadcast_latency_ms', true);
const rtChanges = new Counter('rt_postgres_changes_received');
const rtClosed = new Counter('rt_closed');

// Degrau do teste em que o pedido saiu: s1..s4 = patamar (10/25/50/100%), r1..r4 = subida.
const secs = (d) => (d.endsWith('m') ? Number(d.slice(0, -1)) * 60 : Number(d.slice(0, -1)));
const R = secs(__ENV.RAMP || '1m'), HS = secs(HOLD);
const stageNow = () => {
  const t = exec.instance.currentTestRunDuration / 1000;
  const i = Math.min(4, Math.floor(t / (R + HS)) + 1);
  const into = t - (i - 1) * (R + HS);
  return (into < R ? 'r' : 's') + i;
};
const H = (token) => ({ headers: { apikey: AK, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
const T = (name) => ({ name, stage: stageNow() });
const rpc = (token, name, body, tag) => http.post(`${URL}/rest/v1/rpc/${name}`, JSON.stringify(body ?? {}), { ...H(token), tags: T(tag || name) });
const get = (token, path, tag) => http.get(`${URL}/rest/v1/${path}`, { ...H(token), tags: T(tag) });
const idx = () => exec.scenario.iterationInTest;
const jitter = (s) => sleep(Math.random() * s);

// Chamada: VUs 2k e 2k+1 são o paciente e o psicólogo da sala k.
export function call() {
  const k = idx();
  const room = W().calls[(k >> 1) % W().calls.length];
  const me = k % 2 === 0 ? room.patient : room.psychologist;
  const type = k % 2 === 0 ? 'patient' : 'psychologist';
  const other = type === 'patient' ? 'psychologist' : 'patient';
  jitter(15);
  for (let t = 0; ; t++) {
    http.post(`${URL}/rest/v1/participant_presence?on_conflict=session_id,user_id`,
      JSON.stringify({ session_id: room.session, user_id: me.id, user_type: type, last_seen: new Date().toISOString() }),
      { headers: { ...H(me.token).headers, Prefer: 'resolution=merge-duplicates,return=minimal' }, tags: T('presence_upsert') });
    get(me.token, `participant_presence?select=last_seen,user_type&session_id=eq.${room.session}&user_type=eq.${other}`, 'presence_read');
    rpc(me.token, 'call_clock', { p_session_id: room.session });
    get(me.token, `webrtc_sessions?select=*&id=eq.${room.session}`, 'room_read');
    if (type === 'psychologist') get(me.token, `webrtc_sessions?select=end_reason&id=eq.${room.session}`, 'room_end_reason');
    if (t % 2 === 0) rpc(me.token, 'report_call_media', { p_session_id: room.session, p_connected: true });
    sleep(15);
  }
}

// Psicólogo online na fila do SOS (e respondendo no chat).
export function queue() {
  const k = idx();
  const me = W().queue[k % W().queue.length];
  http.post(`${URL}/rest/v1/psychologist_presence?on_conflict=psychologist_id`,
    JSON.stringify({ psychologist_id: me.id, last_online: new Date().toISOString() }),
    { headers: { ...H(me.token).headers, Prefer: 'resolution=merge-duplicates,return=minimal' }, tags: T('psi_presence_insert') });
  jitter(20);
  for (let t = 0; ; t++) {
    rpc(me.token, 'list_open_emergency_requests', {});
    if (t % 3 === 0) {
      http.patch(`${URL}/rest/v1/psychologist_presence?psychologist_id=eq.${me.id}`, JSON.stringify({ last_online: new Date().toISOString() }),
        { headers: { ...H(me.token).headers, Prefer: 'return=minimal' }, tags: T('psi_presence_beat') });
      const conv = me.convs[t % me.convs.length];
      if (conv) {
        http.post(`${URL}/rest/v1/mensagens`, JSON.stringify({ conversa_id: conv, autor_id: me.id, conteudo: 'mensagem do teste de carga', tipo: 'texto' }),
          { headers: { ...H(me.token).headers, Prefer: 'return=minimal' }, tags: T('chat_send') });
      }
    }
    sleep(20);
  }
}

// Paciente esperando o SOS (pedido encerrado: não aparece na fila de ninguém).
export function waiting() {
  const me = W().waiting[idx() % W().waiting.length];
  jitter(5);
  for (let t = 0; ; t++) {
    get(me.token, `emergency_requests?select=status,room_url,video_room_id&id=eq.${me.request}`, 'sos_check');
    if (t % 3 === 0) rpc(me.token, 'count_available_psychologists', {});
    sleep(5);
  }
}

// Paciente navegando: conversas, notificações, lendo mensagens.
export function browse() {
  const me = W().browse[idx() % W().browse.length];
  jitter(20);
  for (;;) {
    rpc(me.token, 'listar_conversas', {});
    get(me.token, `notifications?select=*&patient_id=eq.${me.id}&order=created_at.desc&limit=20`, 'notifications');
    rpc(me.token, 'marcar_mensagens_como_lidas', { p_conversa_id: me.conv });
    sleep(20);
  }
}

// Tempo real: uma conexão por pessoa, com os canais que a tela dela abre.
// APP=v1: escutas postgres_changes de hoje; APP=v2: lista de conversas por
// aviso do banco (canal privado conversas:<id>) e sem escuta da presença da chamada.
const APP = __ENV.APP || 'v1';
const failKind = (txt) => (/IncreaseConnectionPool|connection pool/i.test(txt) ? 'pool'
  : /timeout/i.test(txt) ? 'timeout' : /Unauthorized|permission/i.test(txt) ? 'unauthorized' : 'other');
const rtSystemError = new Counter('rt_system_error');
export function rt() {
  const all = W().all;
  // Espalha os papéis (sem isso, com o tempo real limitado, só entravam psicólogos).
  const me = all[(idx() * 7919) % all.length];
  const ws = new WebSocket(`${URL.replace(/^http/, 'ws')}/realtime/v1/websocket?apikey=${AK}&vsn=1.0.0`);
  let ref = 0;
  const pending = {};
  const base = { broadcast: { self: false, ack: false }, presence: { key: '' } };
  const join = (topic, kind, config) => {
    const r = String(++ref);
    pending[r] = kind;
    ws.send(JSON.stringify({ topic: `realtime:${topic}`, event: 'phx_join', payload: { config: { ...base, postgres_changes: [], private: false, ...config }, access_token: me.token }, ref: r, join_ref: r }));
  };
  const pg = (table, filter) => ({ postgres_changes: [{ event: '*', schema: 'public', table, filter }] });
  ws.onopen = () => {
    join(`account-status:${me.id}`, 'account-status', { private: true });
    join(`notifications-${me.id}`, 'notifications', pg('notifications', `patient_id=eq.${me.id}`));
    if (APP === 'v2') join(`conversas:${me.id}`, 'conversas', { private: true });
    else join(`conversas-${me.id}`, 'conversas', pg('conversas', `${me.kind === 'patient' ? 'paciente_id' : 'psicologo_id'}=eq.${me.id}`));
    if (me.role === 'queue' || me.role === 'waiting') join('sos-queue', 'sos-queue', { private: true });
    if (me.kind === 'psychologist') join(`psychologist_presence_shared_${me.id}`, 'psi-presence', pg('psychologist_presence', `psychologist_id=eq.${me.id}`));
    if (me.role === 'call') {
      join(`webrtc_session_${me.session}_${me.id}`, 'call-room', { postgres_changes: [{ event: 'UPDATE', schema: 'public', table: 'webrtc_sessions', filter: `id=eq.${me.session}` }] });
      if (APP !== 'v2') join(`participant-heartbeat:${me.session}:${me.id}`, 'call-presence', pg('participant_presence', `session_id=eq.${me.session}`));
    }
    ws.hb = setInterval(() => { try { ws.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(++ref) })); } catch (e) { /* fechado */ } }, 25000);
  };
  ws.onmessage = (e) => {
    let m;
    try { m = JSON.parse(e.data); } catch { return; }
    if (m.event === 'phx_reply' && pending[m.ref]) {
      const kind = pending[m.ref];
      delete pending[m.ref];
      if (m.payload && m.payload.status === 'ok') rtJoinOk.add(1, { topic: kind });
      else rtJoinFail.add(1, { topic: kind, kind: failKind(JSON.stringify(m.payload && m.payload.response)) });
    } else if (m.event === 'system' && m.payload && m.payload.status === 'error') {
      rtSystemError.add(1, { kind: failKind(String(m.payload.message)) });
    } else if (m.event === 'broadcast') {
      rtBroadcast.add(1, { event: String(m.payload && m.payload.event) });
      const ts = m.payload && m.payload.payload && Number(m.payload.payload.ts);
      if (ts) rtLatency.add(Date.now() - ts);
    } else if (m.event === 'postgres_changes') {
      rtChanges.add(1);
    }
  };
  ws.onerror = () => rtJoinFail.add(1, { topic: 'socket', kind: 'socket' });
  ws.onclose = () => { rtClosed.add(1); if (ws.hb) clearInterval(ws.hb); };
}
