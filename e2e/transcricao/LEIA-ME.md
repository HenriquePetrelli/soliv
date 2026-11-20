# Teste de ponta a ponta da transcrição das chamadas

Valida a transcrição inteira, do microfone do navegador ao texto no histórico da psicóloga, **sem tocar na produção**: o Supabase, as edge functions e o serviço de transcrição sobem nesta máquina.

```bash
e2e/transcricao/rodar.sh
```

Precisa de Docker e Node. A primeira vez baixa as imagens do Supabase (alguns minutos). `--manter` deixa tudo de pé no fim, para rodar de novo só os testes:

```bash
npx playwright test -c playwright.transcricao.config.ts
```

Se o Chromium do Playwright não estiver instalado na versão do projeto, aponte para outro com `E2E_CHROMIUM_PATH=/caminho/do/chrome`.

## O que sobe

| Parte | Como |
|---|---|
| Banco, login, realtime, API | `supabase start` (projeto `soliv-e2e`, em `.e2e-transcricao/`) com **todas as migrations do repositório**. As migrations antigas do Lovable não rodam de novo do zero; o script aplica cada uma e, se uma falhar, aplica comando a comando. O esquema resultante foi comparado com o da produção em 2026-11-20: mesmas tabelas, colunas, funções, políticas e gatilhos (sobram só as tabelas de cidades e estados, que não são usadas). |
| Edge functions | Os arquivos do repositório, com o Deno da máquina (`functionsHost.ts`), em `127.0.0.1:54399`. O contêiner do Supabase não baixa os imports `esm.sh` em redes com proxy; aqui eles vêm do npm (`import_map.e2e.json`). |
| Serviço de transcrição | `mockGateway.mjs` no lugar do AI Gateway da Lovable (`LOVABLE_AI_GATEWAY_URL`). Confere o pedido e o WAV (16 kHz, mono, 16 bits) e compara o envelope de energia do áudio com a fala de referência de cada participante: responde com a frase de quem falou. Assim o teste prova que o áudio que sai do navegador é a voz certa, inteira, sem depender de um modelo de reconhecimento de fala. |
| App | Build no modo `e2e-local` (`vite.config.ts`), que aponta para o Supabase local. Nenhum outro modo muda. |
| Microfones | Dois Chromium, cada um com uma fala sintetizada (`audio/paciente.wav`, `audio/psicologo.wav`, gerados com `espeak-ng`) como microfone. |

## O que é validado

`backend.spec.ts` (servidor, sem navegador):
- consulta: sem consentimento a sala existe, a transcrição fica desligada e o servidor recusa áudio (`NO_CONSENT`), sem chamar a transcrição;
- só a paciente da consulta consente (psicóloga e outra pessoa, não); o consentimento fica com data e versão;
- os dois lados veem a transcrição ligada; outra pessoa, não;
- cada lado manda a própria voz: o gateway recebe WAV 16 kHz mono e cada áudio bate com a voz certa; o texto é gravado com o papel e o id de quem falou;
- reenvio do mesmo trecho não duplica;
- leitura: psicóloga e paciente leem; outra pessoa, não; a tabela não é lida nem escrita direto pelo app;
- recusas: sem login, fora da sala, áudio que não é WAV, duração inválida, silêncio (nada gravado), chamada encerrada há mais de 5 min;
- SOS: por mensagem o consentimento é ignorado; por vídeo é gravado com a versão e libera a sala; por vídeo sem marcar, a sala recusa áudio;
- excluir a conta arquiva a transcrição.

`call.spec.ts` (dois navegadores):
- a paciente vê a tela "Antes de entrar na consulta", o botão só funciona com a caixa marcada; a psicóloga entra direto;
- a chamada conecta de verdade (WebRTC, banco marca `connected_at`);
- os dois veem "Chamada sendo transcrita";
- o primeiro trecho de cada lado chega como WAV 16 kHz mono, entre 30 e 40 s (cortado numa pausa da fala), com a frase inteira de quem falou, e vira texto no banco com o papel certo;
- microfone desligado: a paciente some da transcrição (no máximo o trecho que já estava em andamento), a psicóloga continua;
- a psicóloga abre Consultas → Histórico → Ver e lê a transcrição;
- sem marcar o consentimento, a paciente volta sem abrir a sala e nada é gravado;
- SOS: na confirmação, o botão só chama por vídeo com a caixa marcada, e o pedido sai com o consentimento.

Capturas de tela de cada etapa ficam em `test-results/`.

## O que este teste não cobre

O **serviço de transcrição real** (Lovable AI Gateway / Gemini, ou OpenAI). Ele só é testado em produção, com uma chamada de teste (pendência 32 em `docs/pendencias-antes-do-lancamento.md`).
