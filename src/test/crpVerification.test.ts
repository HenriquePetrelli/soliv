import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  buildCfpBookmarkletSource,
  canApproveWithCrp,
  crpCheckState,
  crpStatusFromRow,
  matchCfpRows,
  namesMatch,
  parseCfpCapture,
  parseCfpRegion,
  parseCrp,
  rowMatchesCrp,
  type CfpRow,
} from '@/lib/crpVerification';

const row = (over: Partial<CfpRow> = {}): CfpRow => ({
  situacao: 'ATIVO',
  nome: 'ADRIANA CLAUDIA BAVELLONI',
  regiao: '08ª Região - PR',
  registro: '09958',
  inscricao: '30/01/2004',
  ...over,
});

describe('CRP: leitura do número', () => {
  it('separa região e número nos formatos comuns', () => {
    expect(parseCrp('08/09958')).toEqual({ region: 8, registration: '9958' });
    expect(parseCrp('CRP 08/09958')).toEqual({ region: 8, registration: '9958' });
    expect(parseCrp('06-123456')).toEqual({ region: 6, registration: '123456' });
  });

  it('com um só grupo de números, compara só o número', () => {
    expect(parseCrp('09958')).toEqual({ region: null, registration: '9958' });
  });

  it('sem números, não há CRP', () => {
    expect(parseCrp('')).toBeNull();
    expect(parseCrp('abc')).toBeNull();
    expect(parseCrp(null)).toBeNull();
  });

  it('lê a região do CFP', () => {
    expect(parseCfpRegion('08ª Região - PR')).toBe(8);
    expect(parseCfpRegion('')).toBeNull();
  });
});

describe('CRP: comparação com a tabela do CFP', () => {
  it('acha a linha pelo número e pela região, ignorando zeros à esquerda', () => {
    expect(rowMatchesCrp(row(), '08/9958')).toBe(true);
    expect(rowMatchesCrp(row(), '08/09958')).toBe(true);
  });

  it('mesma numeração em outra região não é o mesmo CRP', () => {
    expect(rowMatchesCrp(row(), '06/09958')).toBe(false);
  });

  it('encontra o psicólogo e confere o nome sem acentos', () => {
    const rows = [row({ nome: 'OUTRA PESSOA', registro: '11111' }), row()];
    const match = matchCfpRows({ full_name: 'Adriana Cláudia Bavelloni', crp_number: '08/09958' }, rows);
    expect(match).toEqual({ kind: 'found', row: rows[1], nameMatches: true });
  });

  it('avisa quando o número bate mas o nome não', () => {
    const match = matchCfpRows({ full_name: 'Maria Souza', crp_number: '08/09958' }, [row()]);
    expect(match).toMatchObject({ kind: 'found', nameMatches: false });
  });

  it('CRP fora dos resultados: não encontrado', () => {
    expect(matchCfpRows({ full_name: 'Ana', crp_number: '08/12345' }, [row()])).toEqual({ kind: 'not_found' });
  });

  it('CRP ilegível no cadastro', () => {
    expect(matchCfpRows({ full_name: 'Ana', crp_number: 'xx' }, [row()])).toEqual({ kind: 'invalid_crp' });
  });

  it('número sem região que aparece em duas regiões: desempata pelo nome', () => {
    const rows = [row(), row({ nome: 'JOSE DA SILVA', regiao: '06ª Região - SP' })];
    expect(matchCfpRows({ full_name: 'José da Silva', crp_number: '09958' }, rows)).toEqual({ kind: 'found', row: rows[1], nameMatches: true });
    expect(matchCfpRows({ full_name: 'Fulano', crp_number: '09958' }, rows)).toEqual({ kind: 'ambiguous', rows });
  });

  it('nome de registro com sobrenome a mais ainda bate', () => {
    expect(namesMatch('ADRIANA CLAUDIA BAVELLONI', 'Adriana Bavelloni')).toBe(true);
    expect(namesMatch('ADRIANA CLAUDIA BAVELLONI', 'Adriana Souza')).toBe(false);
  });

  it('status salvo sai da situação do CFP', () => {
    expect(crpStatusFromRow(row())).toBe('ativo');
    expect(crpStatusFromRow(row({ situacao: 'CANCELADO' }))).toBe('irregular');
    expect(crpStatusFromRow(null)).toBe('nao_encontrado');
  });
});

describe('CRP: prazos', () => {
  const now = new Date('2026-11-13T12:00:00Z');
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000).toISOString();

  it('aprovação exige ATIVO numa consulta dos últimos 30 dias', () => {
    expect(canApproveWithCrp({ crp_status: 'ativo', crp_verified_at: daysAgo(2) }, now)).toBe(true);
    expect(canApproveWithCrp({ crp_status: 'ativo', crp_verified_at: daysAgo(31) }, now)).toBe(false);
    expect(canApproveWithCrp({ crp_status: 'irregular', crp_verified_at: daysAgo(1) }, now)).toBe(false);
    expect(canApproveWithCrp({}, now)).toBe(false);
  });

  it('rotina: reverificar depois de 6 meses', () => {
    expect(crpCheckState({}, now)).toBe('nunca');
    expect(crpCheckState({ crp_status: 'ativo', crp_verified_at: daysAgo(100) }, now)).toBe('ok');
    expect(crpCheckState({ crp_status: 'ativo', crp_verified_at: daysAgo(181) }, now)).toBe('vencida');
    expect(crpCheckState({ crp_status: 'irregular', crp_verified_at: daysAgo(1) }, now)).toBe('irregular');
  });
});

describe('CRP: resultado vindo do atalho', () => {
  it('aceita objeto ou texto copiado e limpa os campos', () => {
    const payload = { source: 'soliv-cfp', version: 1, rows: [row({ nome: '  ANA   LIMA ' }), { nome: '' }], query: 'ana' };
    expect(parseCfpCapture(payload)?.rows).toEqual([row({ nome: 'ANA LIMA' })]);
    expect(parseCfpCapture(JSON.stringify(payload))?.query).toBe('ana');
  });

  it('ignora mensagens que não são do atalho', () => {
    expect(parseCfpCapture({ rows: [] })).toBeNull();
    expect(parseCfpCapture('não é json')).toBeNull();
  });
});

describe('CRP: atalho do navegador na página do CFP', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('lê a tabela de resultados e envia à janela do painel', async () => {
    document.body.innerHTML = `
      <input type="text" value="claudi">
      <table>
        <thead><tr><th>Situação</th><th>Nome</th><th>Região</th><th>Nº de registro</th><th>Data de Inscrição</th></tr></thead>
        <tbody>
          <tr><td>ATIVO</td><td>ADRIANA CLAUDIA BAVELLONI</td><td>08ª Região - PR</td><td>09958</td><td>30/01/2004</td></tr>
          <tr><td>CANCELADO</td><td>CLAUDIA SOUZA</td><td>08ª Região - PR</td><td>01234</td><td>01/02/1999</td></tr>
        </tbody>
      </table>`;
    const postMessage = vi.fn();
    Object.defineProperty(window, 'opener', { value: { closed: false, postMessage }, configurable: true });
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    new Function(buildCfpBookmarkletSource('https://app.soliv.test'))();
    await Promise.resolve();
    await Promise.resolve();

    expect(postMessage).toHaveBeenCalledTimes(1);
    const [payload, origin] = postMessage.mock.calls[0];
    expect(origin).toBe('https://app.soliv.test');
    const capture = parseCfpCapture(payload);
    expect(capture?.query).toBe('claudi');
    expect(capture?.rows).toEqual([
      row(),
      { situacao: 'CANCELADO', nome: 'CLAUDIA SOUZA', regiao: '08ª Região - PR', registro: '01234', inscricao: '01/02/1999' },
    ]);
    expect(writeText).toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith(expect.stringContaining('2 resultado(s)'));
    Object.defineProperty(window, 'opener', { value: null, configurable: true });
  });
});
