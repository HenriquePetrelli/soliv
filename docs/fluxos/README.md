# Fluxos do Soliv: como cada funcionalidade funciona e como validar

Uma ficha por funcionalidade. Cada ficha responde, sempre na mesma ordem:

1. **Status**: se está pronta, o que falta e quando foi verificada pela última vez.
2. **Como funciona**: o caminho da pessoa na tela e o que acontece por trás.
3. **Regras**: o que o app permite e o que recusa.
4. **Onde está no código**: telas, tabelas, funções do banco, edge functions e rotinas.
5. **Como validar**: teste manual com o resultado esperado, testes automáticos e SQL de conferência.
6. **Problemas comuns**: sintoma, causa provável e o que olhar.

Para regras de negócio em texto corrido e o histórico de cada mudança, veja `docs/visao-geral-do-produto.md`. Pendências antes do lançamento ficam em `docs/pendencias-antes-do-lancamento.md`. Para validar o app inteiro com uma lista curta de passos, use `docs/roteiro-de-testes.md`.

## Índice

| # | Funcionalidade | Ficha | Status | Última verificação |
|---|---|---|---|---|
| 1 | Cadastro, login, senha e perfis | [01-contas-e-acesso.md](01-contas-e-acesso.md) | Pronto, com pendência externa | 2026-10-04 |
| 2 | SOS (atendimento de emergência) | [02-sos.md](02-sos.md) | Pronto, com pendência externa | 2026-10-04 |
| 3 | Chamada de vídeo (SOS e consulta) | [03-chamada-de-video.md](03-chamada-de-video.md) | Pronto, com pendência externa | 2026-10-04 |
| 4 | Consultas agendadas | [04-consultas-agendadas.md](04-consultas-agendadas.md) | Pronto | 2026-10-04 |
| 5 | Agenda do psicólogo | [05-agenda-do-psicologo.md](05-agenda-do-psicologo.md) | Pronto | 2026-09-24 |
| 6 | Chat paciente e psicólogo | [06-chat.md](06-chat.md) | Pronto | 2026-10-04 |
| 7 | Notificações e push | [07-notificacoes-e-push.md](07-notificacoes-e-push.md) | Pronto, com pendência externa | 2026-10-04 |
| 8 | Assinaturas e pagamentos (Stripe) | [08-assinaturas-e-pagamentos.md](08-assinaturas-e-pagamentos.md) | Pronto, com pendência externa | 2026-10-04 |
| 9 | Repasses aos psicólogos | [09-repasses.md](09-repasses.md) | Pronto, com decisão pendente | 2026-10-04 |
| 10 | Empresas (B2B) | [10-empresas-b2b.md](10-empresas-b2b.md) | Pronto | 2026-10-04 |
| 11 | Meus hábitos | [11-meus-habitos.md](11-meus-habitos.md) | Pronto | 2026-10-03 |
| 12 | Meu progresso (humor, sequência, conquistas, metas) | [12-meu-progresso.md](12-meu-progresso.md) | Pronto | 2026-10-04 |
| 13 | Questionários (GAD-7 e PHQ-9) | [13-questionarios.md](13-questionarios.md) | Pronto | 2026-10-04 |
| 14 | Plano de segurança | [14-plano-de-seguranca.md](14-plano-de-seguranca.md) | Pronto | 2026-10-04 |
| 15 | Autocuidado (respiração, sons, comer com atenção, diário) | [15-autocuidado.md](15-autocuidado.md) | Pronto | 2026-10-04 |
| 16 | Grupos de apoio | [16-grupos-de-apoio.md](16-grupos-de-apoio.md) | Pronto | 2026-10-04 |
| 17 | Suporte (paciente e psicólogo) | [17-suporte.md](17-suporte.md) | Pronto, com pendência externa | 2026-10-05 |
| 18 | Privacidade e LGPD (termos, exportar, excluir conta) | [18-privacidade-e-lgpd.md](18-privacidade-e-lgpd.md) | Pronto, documentos em revisão | 2026-09-28 |
| 19 | Painel do admin | [19-painel-admin.md](19-painel-admin.md) | Pronto, com pendência crítica | 2026-10-02 |
| 20 | Segurança (proteções transversais) | [20-seguranca.md](20-seguranca.md) | Pronto, com pendência externa | 2026-10-04 |
| 21 | Rotinas automáticas (cron) | [21-rotinas-automaticas.md](21-rotinas-automaticas.md) | Pronto | 2026-10-04 |

## Legenda de status

- **Pronto**: o código foi revisado de ponta a ponta, tem testes automáticos ou checagens SQL validadas, e não há pendência conhecida.
- **Pronto, com pendência externa**: o código está pronto, mas uma parte depende de configuração fora do código (Firebase, TURN, Stripe, painel do Supabase). A ficha diz o que falta e o que acontece enquanto não for feito.
- **Pronto, com pendência / decisão pendente**: funciona, mas há um ajuste ou decisão de produto registrado.
- **Funciona, sem varredura recente**: funciona e já foi revisado, mas não passou pela varredura mais recente. Vale fazer o teste manual da ficha antes do lançamento.

**Importante:** "Pronto" quer dizer revisado e testado no código, com testes automáticos e um Postgres local. Nenhum teste aqui roda contra o banco de produção. O que confirma que está funcionando de verdade é o **teste manual** de cada ficha, feito no app publicado.

## Teste rápido de regressão (cerca de 20 minutos)

Faça depois de cada publicação grande. São necessárias 3 contas de teste: um **paciente com plano Completo**, um **psicólogo aprovado** e um **admin**. O ideal é usar dois aparelhos ou dois navegadores, um deles em janela anônima.

| # | Passo | Resultado esperado | Ficha |
|---|---|---|---|
| 1 | Entrar como paciente e sair | Entra na Home; ao sair, volta para a tela de login | 01 |
| 2 | Paciente registra o humor do dia | Humor salvo; aparece em Meu progresso | 12 |
| 3 | Psicólogo entra e fica online | Painel mostra "Online"; o paciente vê "1 profissional disponível" no SOS | 02 |
| 4 | Paciente aperta SOS; psicólogo aceita | Os dois entram na mesma sala de vídeo, com áudio e vídeo dos dois lados | 02, 03 |
| 5 | No meio da chamada, desligar o Wi-Fi do paciente por 20 s | Faixa "Tentando reconectar"; a chamada volta sozinha, sem encerrar | 03 |
| 6 | Psicólogo encerra o SOS | Os dois saem; o paciente vê a avaliação obrigatória | 02 |
| 7 | Paciente agenda consulta; psicólogo aceita | A consulta aparece como confirmada nos dois lados, com notificação | 04 |
| 8 | Mandar mensagem e foto no chat | Chega na hora do outro lado; a foto abre | 06 |
| 9 | Abrir Planos | Plano atual correto; botões coerentes com o plano | 08 |
| 10 | Admin abre o painel | Métricas carregam; a lista de psicólogos abre | 19 |

Se algum passo falhar, vá para a seção **Problemas comuns** da ficha indicada.

## Como o app está montado (para entender qualquer ficha)

- **Frontend**: React + Vite + TypeScript, publicado pela Lovable. Fica em `src/`. Telas em `src/pages`, componentes em `src/components`, regras puras (testáveis) em `src/lib`, acesso a dados em `src/hooks`.
- **Banco**: Supabase (Postgres). Toda tabela tem RLS, ou seja, regras que dizem quem lê e quem grava cada linha. Ações sensíveis passam por **funções do banco** (RPC) ou **gatilhos** (triggers), nunca só pela tela.
- **Edge functions**: código no servidor em `supabase/functions/<nome>/index.ts`, para o que precisa de segredo ou de serviço externo (Stripe, Firebase, e-mail, TURN). Funções compartilhadas ficam em `supabase/functions/_shared/`.
- **Rotinas automáticas**: `pg_cron` no banco. Algumas rodam SQL direto; outras chamam uma edge function. Veja a ficha 21.
- **Migrações**: `supabase/migrations/`. A Lovable aplica e cria uma cópia com nome `data_hora-uuid.sql`; a cópia original é removida depois.
- **Tempo real**: Supabase Realtime (mudanças em tabelas e presença). Toda tela que depende dele também consulta de tempos em tempos, porque o realtime cai quando a tela apaga ou a rede troca.
- **Fuso horário**: tudo que é "dia" (sequência, cotas do mês, limite do diário, lembretes) usa o horário de Brasília (`America/Sao_Paulo`), nunca UTC.

## Como rodar os testes automáticos

```bash
npx tsc --noEmit -p tsconfig.app.json   # tipos
npx vitest run                          # todos os testes (src/test e e2e simulados)
npx vitest run src/test/<arquivo>        # um arquivo
npm run lint                             # padrão de código
npm run build                            # build de produção
```

Os testes SQL ficam em `supabase/tests/*.sql`. Eles rodam num Postgres local com as migrações aplicadas e **não** devem ser rodados no banco de produção, porque criam e apagam dados de teste. No GitHub Actions, `.github/workflows/sos-e2e.yml` roda tipos, a suíte do Vitest e um smoke test do SOS no navegador (Playwright, `e2e/sos.smoke.spec.ts`).

## Onde conferir o banco de produção

No Supabase, **SQL Editor**. Cada ficha traz consultas só de leitura (`select`), seguras para rodar. Nunca rode `update`, `delete` ou `insert` em produção sem saber exatamente o efeito.

## Como manter estas fichas

- Mudou o comportamento de uma funcionalidade: atualize a ficha dela (seções "Como funciona", "Regras" e "Status") e a data de "Última verificação".
- Criou uma funcionalidade: crie a ficha copiando a estrutura de uma existente e adicione a linha no índice acima.
- Achou um bug: registre na seção "Problemas comuns" da ficha, com sintoma, causa e correção.
