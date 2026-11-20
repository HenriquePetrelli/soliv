// Gateway de transcrição falso, para o teste de ponta a ponta local.
//
// Fica no lugar do AI Gateway da Lovable (LOVABLE_AI_GATEWAY_URL). Para cada
// trecho recebido:
// 1. confere o pedido no formato que a edge function manda (modelo, prompt,
//    input_audio em WAV);
// 2. confere o WAV: PCM 16 bits, mono, 16 kHz, duração;
// 3. compara o envelope de energia do áudio com a fala de referência de cada
//    participante (os mesmos arquivos usados como microfone falso do
//    navegador) e responde com a frase de quem bateu.
// Assim o teste prova que o áudio que sai do navegador é a voz certa, inteira
// e na frequência certa, sem depender de um modelo de reconhecimento de fala.
//
// Uso: node mockGateway.mjs <porta> <ref1.wav>=<frase1> <ref2.wav>=<frase2> ...
// GET /log devolve os trechos recebidos (para o teste conferir).

import http from 'node:http';
import fs from 'node:fs';

const port = Number(process.argv[2] ?? 8787);
const references = process.argv.slice(3).map((arg) => {
  const [file, ...text] = arg.split('=');
  return { file, text: text.join('='), envelope: envelope(readWav(fs.readFileSync(file))) };
});

const log = [];

export function readWav(buf) {
  const text = (o) => buf.toString('ascii', o, o + 4);
  if (text(0) !== 'RIFF' || text(8) !== 'WAVE') throw new Error('não é WAV');
  let offset = 12;
  let fmt = null;
  while (offset + 8 <= buf.length) {
    const id = text(offset);
    const size = buf.readUInt32LE(offset + 4);
    if (id === 'fmt ') {
      fmt = {
        format: buf.readUInt16LE(offset + 8),
        channels: buf.readUInt16LE(offset + 10),
        sampleRate: buf.readUInt32LE(offset + 12),
        bits: buf.readUInt16LE(offset + 22),
      };
    } else if (id === 'data') {
      if (!fmt) throw new Error('WAV sem fmt');
      const frames = Math.floor(size / (fmt.bits / 8) / fmt.channels);
      const samples = new Float32Array(frames);
      for (let i = 0; i < frames; i++) {
        samples[i] = buf.readInt16LE(offset + 8 + i * 2 * fmt.channels) / 32768;
      }
      return { ...fmt, samples };
    }
    offset += 8 + size + (size % 2);
  }
  throw new Error('WAV sem data');
}

/** Energia em janelas de 20 ms, na mesma frequência para qualquer WAV. */
export function envelope({ samples, sampleRate }) {
  const win = Math.round(sampleRate * 0.02);
  const out = [];
  for (let i = 0; i + win <= samples.length; i += win) {
    let sum = 0;
    for (let j = i; j < i + win; j++) sum += samples[j] * samples[j];
    out.push(Math.sqrt(sum / win));
  }
  return out;
}

/** Maior correlação normalizada da referência deslizando sobre o trecho. */
export function bestCorrelation(chunk, ref) {
  if (chunk.length < ref.length) return 0;
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const refMean = mean(ref);
  const refDev = ref.map((v) => v - refMean);
  const refNorm = Math.sqrt(refDev.reduce((s, v) => s + v * v, 0));
  let best = 0;
  for (let lag = 0; lag + ref.length <= chunk.length; lag++) {
    const win = chunk.slice(lag, lag + ref.length);
    const m = mean(win);
    let dot = 0;
    let norm = 0;
    for (let i = 0; i < ref.length; i++) {
      const d = win[i] - m;
      dot += d * refDev[i];
      norm += d * d;
    }
    const c = norm > 0 && refNorm > 0 ? dot / (Math.sqrt(norm) * refNorm) : 0;
    if (c > best) best = c;
  }
  return best;
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/log') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(log));
    return;
  }
  if (req.method === 'DELETE' && req.url === '/log') {
    log.length = 0;
    res.writeHead(204);
    res.end();
    return;
  }
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const entry = { at: new Date().toISOString(), ok: false };
    try {
      if (req.headers.authorization !== 'Bearer local-test-key') throw new Error('chave errada');
      const body = JSON.parse(raw);
      const part = body.messages?.[1]?.content?.find((p) => p.type === 'input_audio');
      if (!body.model || !body.messages?.[0]?.content?.includes('português')) throw new Error('pedido fora do formato');
      if (!part || part.input_audio.format !== 'wav') throw new Error('sem input_audio wav');
      const wav = readWav(Buffer.from(part.input_audio.data, 'base64'));
      Object.assign(entry, {
        format: wav.format,
        channels: wav.channels,
        sampleRate: wav.sampleRate,
        bits: wav.bits,
        seconds: Number((wav.samples.length / wav.sampleRate).toFixed(2)),
      });
      if (wav.format !== 1 || wav.channels !== 1 || wav.sampleRate !== 16000 || wav.bits !== 16) throw new Error('WAV fora do padrão');
      const env = envelope(wav);
      const scores = references.map((r) => ({ text: r.text, score: Number(bestCorrelation(env, r.envelope).toFixed(3)) }));
      scores.sort((a, b) => b.score - a.score);
      entry.scores = scores;
      const match = scores[0] && scores[0].score >= 0.6 ? scores[0].text : '';
      entry.ok = true;
      entry.text = match;
      log.push(entry);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: match } }] }));
    } catch (error) {
      entry.error = String(error.message ?? error);
      log.push(entry);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: entry.error }));
    }
  });
});

server.listen(port, '0.0.0.0', () => console.log(`mock gateway em :${port}`));
