// Verificação do CRP no Cadastro Nacional do CFP (cadastro.cfp.org.br).
//
// O site do CFP tem reCAPTCHA, então a consulta continua sendo feita por uma
// pessoa. O atalho do navegador (bookmarklet) só lê a tabela de resultados
// que já está na tela e manda para o painel; aqui fica a parte que compara
// essa tabela com o CRP cadastrado no app.
//
// Sem dependências do Deno: o painel (src/lib/crpVerification.ts) e a função
// psychologist-management usam o mesmo código.

/** Uma linha da tabela de resultados do CFP. */
export interface CfpRow {
  situacao: string;
  nome: string;
  regiao: string;
  registro: string;
  inscricao: string;
}

/** Resultado da busca no CFP, como o atalho do navegador envia. */
export interface CfpCapture {
  source: 'soliv-cfp';
  version: 1;
  rows: CfpRow[];
  query?: string;
  capturedAt?: string;
}

/** Situação do CRP guardada no app. */
export type CrpStatus = 'ativo' | 'irregular' | 'nao_encontrado';

/** De quanto em quanto tempo o CRP de quem já atende é conferido de novo. */
export const CRP_RECHECK_DAYS = 180;

/** Para aprovar um cadastro, a consulta ao CFP tem de ser recente. */
export const CRP_APPROVAL_MAX_AGE_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_ROWS = 500;
const MAX_FIELD = 200;

const digits = (value: string) => value.replace(/\D/g, '');
const stripZeros = (value: string) => value.replace(/^0+(?=\d)/, '');

/** Número de registro sem pontuação e sem zeros à esquerda ("09958" → "9958"). */
export const normalizeRegistration = (value: string): string => stripZeros(digits(value ?? ''));

/**
 * Lê o CRP como o psicólogo digitou: "08/09958", "CRP 08/09958", "08-09958".
 * Com dois ou mais grupos de números, o primeiro é a região. Com um só, não
 * dá para separar a região do número, e só o número é comparado.
 */
export const parseCrp = (crp: string | null | undefined): { region: number | null; registration: string } | null => {
  const groups = (crp ?? '').match(/\d+/g);
  if (!groups || groups.length === 0) return null;
  if (groups.length === 1) {
    const registration = stripZeros(groups[0]);
    return registration ? { region: null, registration } : null;
  }
  const region = Number.parseInt(groups[0], 10);
  const registration = stripZeros(groups.slice(1).join(''));
  if (!registration) return null;
  return { region: Number.isFinite(region) && region > 0 ? region : null, registration };
};

/** Região da coluna do CFP: "08ª Região - PR" → 8. */
export const parseCfpRegion = (regiao: string): number | null => {
  const match = (regiao ?? '').match(/\d+/);
  if (!match) return null;
  const value = Number.parseInt(match[0], 10);
  return Number.isFinite(value) && value > 0 ? value : null;
};

/** Nome sem acentos, em maiúsculas, com espaços simples. */
export const normalizeName = (name: string): string =>
  (name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Os nomes batem? Iguais, ou todas as palavras do nome mais curto aparecem no
 * mais longo (o CFP mostra o nome de registro, que às vezes tem um sobrenome
 * a mais ou a menos que o do cadastro). Preposições ("de", "da") não contam.
 */
export const namesMatch = (a: string, b: string): boolean => {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const words = (s: string) => s.split(' ').filter((w) => w.length > 2);
  const [shorter, longer] = words(na).length <= words(nb).length ? [words(na), new Set(words(nb))] : [words(nb), new Set(words(na))];
  return shorter.length >= 2 && shorter.every((w) => longer.has(w));
};

/** A situação no CFP permite atender? Só "ATIVO" conta. */
export const isCfpActive = (situacao: string): boolean => {
  const value = normalizeName(situacao);
  return value === 'ATIVO' || value === 'ATIVA';
};

/** Status guardado no app a partir da linha escolhida (ou de nenhuma). */
export const crpStatusFromRow = (row: Pick<CfpRow, 'situacao'> | null): CrpStatus =>
  row ? (isCfpActive(row.situacao) ? 'ativo' : 'irregular') : 'nao_encontrado';

/** A linha do CFP é do CRP cadastrado (mesmo número e, quando dá para saber, mesma região)? */
export const rowMatchesCrp = (row: Pick<CfpRow, 'regiao' | 'registro'>, crp: string): boolean => {
  const parsed = parseCrp(crp);
  if (!parsed) return false;
  if (normalizeRegistration(row.registro) !== parsed.registration) return false;
  const rowRegion = parseCfpRegion(row.regiao);
  return parsed.region === null || rowRegion === null || rowRegion === parsed.region;
};

export type CrpMatch =
  | { kind: 'invalid_crp' }
  | { kind: 'not_found' }
  | { kind: 'found'; row: CfpRow; nameMatches: boolean }
  | { kind: 'ambiguous'; rows: CfpRow[] };

/** Procura, na tabela do CFP, a linha do CRP cadastrado no app. */
export const matchCfpRows = (psychologist: { full_name: string; crp_number: string }, rows: CfpRow[]): CrpMatch => {
  if (!parseCrp(psychologist.crp_number)) return { kind: 'invalid_crp' };
  const candidates = rows.filter((row) => rowMatchesCrp(row, psychologist.crp_number));
  if (candidates.length === 0) return { kind: 'not_found' };
  if (candidates.length === 1) {
    return { kind: 'found', row: candidates[0], nameMatches: namesMatch(candidates[0].nome, psychologist.full_name) };
  }
  const byName = candidates.filter((row) => namesMatch(row.nome, psychologist.full_name));
  if (byName.length === 1) return { kind: 'found', row: byName[0], nameMatches: true };
  return { kind: 'ambiguous', rows: candidates };
};

const field = (value: unknown): string => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, MAX_FIELD) : '');

/** Linha vinda de fora (atalho, texto colado, corpo da requisição), limpa. */
export const sanitizeCfpRow = (raw: unknown): CfpRow | null => {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const row: CfpRow = {
    situacao: field(r.situacao),
    nome: field(r.nome),
    regiao: field(r.regiao),
    registro: field(r.registro),
    inscricao: field(r.inscricao),
  };
  return row.nome && normalizeRegistration(row.registro) ? row : null;
};

/** Lê o que o atalho enviou (objeto ou o texto copiado). Null se não for dele. */
export const parseCfpCapture = (raw: unknown): CfpCapture | null => {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value.trim());
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (v.source !== 'soliv-cfp' || !Array.isArray(v.rows)) return null;
  const rows = v.rows.slice(0, MAX_ROWS).map(sanitizeCfpRow).filter((r): r is CfpRow => r !== null);
  return {
    source: 'soliv-cfp',
    version: 1,
    rows,
    query: field(v.query) || undefined,
    capturedAt: field(v.capturedAt) || undefined,
  };
};

/** Dias desde a última consulta (Infinity se nunca foi feita). */
const daysSince = (iso: string | null | undefined, now: Date): number => {
  if (!iso) return Infinity;
  const time = new Date(iso).getTime();
  return Number.isFinite(time) ? (now.getTime() - time) / DAY_MS : Infinity;
};

export interface CrpVerificationFields {
  crp_status?: string | null;
  crp_verified_at?: string | null;
}

/** Pode aprovar o cadastro: CRP ativo no CFP numa consulta recente. */
export const canApproveWithCrp = (p: CrpVerificationFields, now = new Date()): boolean =>
  p.crp_status === 'ativo' && daysSince(p.crp_verified_at, now) <= CRP_APPROVAL_MAX_AGE_DAYS;

export type CrpCheckState = 'nunca' | 'vencida' | 'ok' | 'irregular' | 'nao_encontrado';

/**
 * Estado do CRP para o painel:
 * - irregular / nao_encontrado: a última consulta achou problema;
 * - nunca: nunca foi conferido;
 * - vencida: estava ativo, mas a consulta tem mais de 6 meses;
 * - ok: ativo e conferido nos últimos 6 meses.
 */
export const crpCheckState = (p: CrpVerificationFields, now = new Date()): CrpCheckState => {
  if (p.crp_status === 'irregular') return 'irregular';
  if (p.crp_status === 'nao_encontrado') return 'nao_encontrado';
  if (p.crp_status !== 'ativo' || !p.crp_verified_at) return 'nunca';
  return daysSince(p.crp_verified_at, now) > CRP_RECHECK_DAYS ? 'vencida' : 'ok';
};

/** Precisa de atenção na verificação de rotina (tudo que não está "ok"). */
export const needsCrpCheck = (p: CrpVerificationFields, now = new Date()): boolean => crpCheckState(p, now) !== 'ok';
