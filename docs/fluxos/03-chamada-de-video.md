# 03. Chamada de vídeo (SOS e consulta)

> **Status:** Pronto, com pendência externa (TURN).
> **Última verificação:** 2026-10-26 (presença na sala só pelas regras do banco: o app não forja mais "sem áudio/vídeo" nem o último sinal; TURN só para quem está numa sala de chamada).
> **Quem usa:** paciente e psicólogo, no SOS (ficha 02) e na consulta agendada (ficha 04).

## Resumo

A chamada é de navegador para navegador (WebRTC). O Supabase só faz a "apresentação" entre os dois (sinalização) e guarda o estado da sala. **SOS e consulta usam a mesma sala** (`VideoCallRoom`) e o mesmo motor (`useWebRTC`): um ajuste vale para os dois. A diferença visível é só a duração (SOS 25 min, consulta 50 min); por baixo mudam as regras de cada um (como encerra, as saídas quando o outro some ou a chamada não conecta).

### Tela (padrão do Google Meet)
- Palco escuro e neutro, sem gradientes; o outro participante ocupa o palco, com o **nome e o microfone juntos** no canto (vermelho quando mutado; barras quando está falando, e o quadro ganha borda).
- Câmera desligada: avatar com as iniciais e "Fulano desligou a câmera".
- Minha imagem numa miniatura no canto ("Você"), com o vídeo **sempre montado**: desligar e religar a câmera volta na hora.
- Tempo restante no canto superior esquerdo ("pausado" quando alguém está fora); qualidade da rede no direito só quando cai ("Conexão lenta"/"Conexão instável").
- Barra de controles: microfone (Ctrl+D), câmera (Ctrl+E), dispositivos, contexto do paciente (só psicólogo) e encerrar.
- **Contexto do paciente** (psicólogo): divide a tela — contexto à esquerda, vídeo à direita (no celular, vídeo em cima e contexto embaixo), com X para fechar. No SOS mostra a triagem do pedido; na consulta, questionários compartilhados e resumos das consultas anteriores.
- **Plano pós-crise** (psicólogo, ícone de escudo, ao lado do contexto): abre o formulário do plano de segurança para deixar com o paciente. Também aparece em "Encerrar" e no desfecho do SOS. O paciente recebe ao fim do atendimento (ficha 14).
- Não há mais painel de diagnóstico na chamada (`?debug=1` só liga os logs do navegador, para suporte).

## Como funciona

1. **Sala**: cada atendimento tem uma linha em `webrtc_sessions`.
   - No SOS, ela é criada no aceite (ligada por `emergency_request_id`).
   - Na consulta, é criada ou reaproveitada por `get_or_create_appointment_webrtc_session` (`appointments.video_room_id`). Só abre de 10 min antes até 15 min depois do fim previsto.
2. **Câmera e microfone**: o app pede permissão. Sem câmera (negada, ausente ou ocupada), **entra só com áudio** e avisa. Sem microfone, mostra o erro com "Tentar de novo".
3. **Servidores de conexão**: antes de conectar, o app busca STUN e, se configurado, **TURN** na edge function `ice-servers`. Se ela falhar ou demorar mais de 4 s, segue só com STUN.
4. **Conexão**: o psicólogo cria a oferta e o paciente responde (a resposta leva a marca da oferta respondida, `forOffer`; resposta para uma oferta antiga é ignorada). Os candidatos de rede de cada lado são somados no banco numa operação só (`append_webrtc_ice_candidates`), sem um lado apagar os do outro. A sinalização chega pelo realtime e, como garantia, cada lado relê a sala a cada 3 s enquanto não está conectado (6 s quando está): evento ou gravação perdida se corrige sozinha.
5. **Prova de que a chamada aconteceu**: quando áudio/vídeo passa de verdade, cada lado avisa o banco (`report_call_media`). `webrtc_sessions.connected_at` só é preenchido quando **os dois** confirmam; antes bastava o paciente responder à oferta, mesmo sem a mídia nunca chegar. É o que decide se o SOS conta, se a consulta pode ser concluída e se entra no repasse. Enquanto a mídia passa, cada lado repete o aviso a cada 20 s e o banco soma o tempo com os dois conectados (`media_seconds`): a consulta agendada só conta a partir de 5 min.
6. **Canal de controle** (dentro da chamada): estado de câmera e microfone, nome e o aviso "encerrei a chamada", que chega na hora.
7. **Presença**: cada lado avisa "estou na sala" em tempo real (`useCallPresence`) e grava um batimento a cada 15 s em `participant_presence`, junto com se a mídia está passando (`media_connected`). O servidor usa isso para saber se a sala foi abandonada ou se a chamada não está conectando. Pelo app (gatilho `guard_participant_presence`): só quem está na sala grava, o papel (paciente ou psicólogo) vem da sala, o último sinal é a hora do servidor e o estado da mídia só muda por `report_call_media`. Ninguém apaga a própria presença.
8. **Qualidade (como o Meet)**: voz com prioridade sobre o vídeo, teto de 1,5 Mbps no vídeo e, se a rede piorar (atraso alto ou perda de pacotes por alguns segundos), o vídeo reduz a resolução para o áudio continuar limpo; volta ao normal quando a rede melhora.
9. **Transcrição** (desde 2026-11-20): só com o consentimento do paciente, dado antes de entrar (confirmação do SOS por vídeo ou tela antes da sala da consulta; gravado em `emergency_requests`/`appointments.transcription_consent_at`). A sala confere com `get_call_transcription_status` e, ligada, mostra "Chamada sendo transcrita" aos dois. Cada lado envia o próprio microfone em trechos de 30 s (WAV 16 kHz mono; silêncio e microfone desligado não vão) para a edge function `transcribe-call-chunk`, que confere a sala e o consentimento, transcreve e guarda só o texto em `call_transcript_segments` (reenvio do mesmo trecho não duplica). O áudio não é guardado. Leitura: `get_call_transcript`, só o paciente e o psicólogo do atendimento (Histórico de consultas do psicólogo).
10. **Sem medicamentos** (desde 2026-11-20): antes de entrar, o paciente vê que o Soliv não receita medicamentos (confirmação do SOS e tela antes da sala da consulta). Na sala, enquanto a outra pessoa não conecta, os dois veem o mesmo aviso, com texto próprio para cada lado (`NoPrescriptionNotice`). Está também nos Termos (paciente, item 2; psicólogo, item 4).

## Quedas e fluxos alternativos

| Situação | O que acontece |
|---|---|
| Minha internet cai | Faixa "Sem conexão com a internet"; a chamada volta sozinha quando a rede volta |
| Conexão instável | Faixa "Tentando reconectar (tentativa N)". O psicólogo reinicia o caminho de rede (ICE restart) nas 2 primeiras tentativas e, se não voltar, recria a conexão inteira; o paciente, a partir da 2ª, pede ao psicólogo uma conexão nova pelo banco. As tentativas nunca param |
| Os dois na sala, mas áudio/vídeo não passa por 45 s | Painel "A chamada não está conectando". Na consulta: "Tentar de novo" para os dois e "Marcar como interrompida" para o psicólogo. No SOS — paciente: "Tentar de novo", "Chamar outro psicólogo" (sem gastar o SOS) e CVV. Psicólogo: "Tentar de novo" e "Encerrar por falha de conexão" (o SOS volta para o paciente) |
| O outro lado caiu | Faixa "O outro participante perdeu a conexão. A chamada não foi encerrada" |
| O outro lado sumiu por muito tempo | SOS (90 s): paciente pode chamar outro psicólogo. Consulta (2 min após o horário): botão "Avisar" (push) |
| Recarreguei ou fechei o app | Volto para a mesma sala; nada é encerrado. O outro lado percebe a conexão nova (pelo id da oferta/resposta) e recria a sua sozinho |
| Sala não abriu (consulta) | Tela com o motivo, "Tentar de novo" e "Voltar" |
| Atendimento já encerrado | A sala não reabre; aparece como encerrado |
| Abri em duas abas | A segunda é bloqueada (`callLock`) |

O **cronômetro** é um só para os dois lados e vem do banco (`call_clock`): é o tempo com os **dois conectados** que o banco soma a cada aviso de mídia (`report_call_media`, a mesma conta que decide se a consulta aconteceu). Antes de os dois se conectarem mostra o tempo cheio com "aguardando"; começa quando o segundo lado confirma áudio/vídeo; pausa quando um cai ("pausado") e volta de onde parou. Cada aparelho confere o banco a cada 5 s e a cada mudança na sala e só anda o segundo na tela entre uma conferência e outra, então os dois relógios mostram o mesmo valor. Pelo app ninguém grava o cronômetro (antes o psicólogo gravava e cada lado contava por conta própria). No SOS, ao zerar, a chamada termina. Na consulta, ao zerar, só avisa.

**Câmera e microfone escolhidos** ficam guardados (no aparelho e na sala): recarregar a página volta com o que a pessoa tinha deixado, e o outro lado continua vendo certo. Como no Meet, a **câmera desligada solta o aparelho** (a luz da câmera apaga); no lugar dela vai um quadro preto, então religar não precisa renegociar a conexão. Microfone desligado não envia áudio.

## Onde está no código

- **Motor**: `src/hooks/useWebRTC.ts` (sessão, oferta/resposta, reconexão, qualidade, encerramento), `src/lib/callNegotiation.ts` (regras puras: conexão nova do outro lado, resposta da oferta certa, passos da reconexão), `src/hooks/useMediaDeviceManager.ts` (câmera, microfone, fallback só áudio). O antigo gerenciador global de conexões (`webrtc-manager`) foi removido: a cada 30 s ele fechava qualquer conexão "desconectada" e desligava câmera e microfone, e uma queda curta virava chamada morta.
- **Tela**: `src/components/calls/VideoCallRoom.tsx` (a sala única), `src/components/calls/CallParts.tsx` (quadro do participante, microfone ao lado do nome, botões), `src/hooks/useAudioLevel.ts` (indicador de fala). Páginas: `src/pages/EmergencyCall.tsx` (SOS: resolve o pedido e quem é quem pela própria sala) e `src/pages/ConsultationCall.tsx` (consulta: abre a sala com "Tentar de novo" se falhar).
- **Apoio**: `useCallPresence`, `useParticipantHeartbeat`, `useSharedCallTimer`, `useRemoteAbsence`; em `src/lib`: `callBanner`, `reconnect`, `callSignals`, `callLock`, `callTermination`, `iceServers`, `remoteAbsence`, `consultationWindow`.
- **Painéis**: `src/components/calls/RemoteAbsentPanel.tsx`; contexto: `src/components/sos/PatientContextPanel.tsx` (SOS) e `src/components/psychologist/PatientSessionHistory.tsx` (consulta).
- **Edge function**: `ice-servers` (TURN só para quem está numa sala de chamada criada nas últimas 24 h; os outros recebem só STUN).
- **Banco**: `webrtc_sessions` (`patient_media_at`, `psychologist_media_at`, `connected_at`, `renegotiate_requested_at`), `participant_presence` (`media_connected`, `media_changed_at`). Funções `report_call_media` (também atualiza o tempo restante), `call_clock` (o cronômetro dos dois lados), `append_webrtc_ice_candidates`. Gatilhos `prevent_reopen_finished_call` e `a_guard_webrtc_client_update` (pelo app: só o paciente grava a resposta, ninguém mexe no cronômetro (só o banco), ninguém troca o outro participante, o SOS ligado à sala ou quem encerrou). As salas são criadas só pelo servidor.

## Como validar

### Teste manual
1. **Vídeo e áudio**: os dois lados se veem e se ouvem; mutar e desligar a câmera aparece do outro lado.
2. **Sem câmera**: negar a câmera no navegador → entra só com áudio, com o aviso "Câmera indisponível".
3. **Queda curta**: desligar o Wi-Fi de um lado por 20 s → faixa de reconexão → volta sozinha.
4. **Recarregar**: dar F5 no meio da chamada → volta para a mesma sala e o cronômetro continua de onde parou.
4a. **Recarregar mutado**: desligar câmera e microfone e dar F5 → volta com os dois desligados de verdade (luz da câmera apagada, o outro lado não ouve) e com os botões certos.
4b. **Cronômetro**: comparar os dois aparelhos lado a lado → mostram o mesmo tempo; antes de o segundo entrar, "aguardando".
4c. **Janela**: redimensionar, maximizar, minimizar e voltar → a chamada continua.
5. **Rede difícil** (só com TURN configurado): um lado no 4G e outro em rede de empresa → conecta.
6. **Miniatura**: desligar e religar a câmera → a miniatura volta a mostrar o vídeo na hora.
7. **Microfone do outro lado**: o outro muta → ícone vermelho ao lado do nome dele; ao falar, barras animadas.
8. **Contexto** (psicólogo): abre dividindo a tela e fecha pelo X.

### Teste no navegador (duas abas)
Roteiro usado na varredura, com câmera falsa do Chromium e banco simulado: conectar; paciente recarregar; psicólogo recarregar; cada um fechar a aba e voltar; "Tentar de novo" de cada lado; conexão de cada lado morrer sem recarregar; realtime parado (só a releitura); resposta antiga gravada por atraso; três quedas seguidas. Todos voltaram sozinhos em 0,5 a 8 s.

### Testes automáticos
`videoCallRoom`, `callNegotiation`, `iceServers`, `remoteAbsence`, `callMediaStateSignal`, `callPresenceBanner`, `callDiagnostics`, `webrtcSessionReuse.e2e`, `consultationVideoCallSession`, `consultationWindow`, `consultationCallRouteAccess`, `emergencyNetworkDrop`, `emergencyNetworkRecovery.e2e`, `emergencyRefreshRejoin.e2e`.

### Conferência no banco
```sql
-- Estado de uma sala: cada lado confirmou mídia? conectou (os dois)? quem encerrou?
select id, status, patient_media_at, psychologist_media_at, connected_at, ended_by_type, end_reason, created_at, ended_at
from webrtc_sessions where id = '<id da sala>';

-- Presença e mídia de cada lado agora
select user_type, last_seen, media_connected, media_changed_at from participant_presence where session_id = '<id da sala>';
```

Para conferir se o TURN está ativo, a resposta de `ice-servers` traz `"turn": true`. Dá para ver na aba Rede do navegador, durante uma chamada.

## Pendências

- **TURN** (pendência 5): configurar `CLOUDFLARE_TURN_KEY_ID` e `CLOUDFLARE_TURN_API_TOKEN` (ou `TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL`) nos secrets das edge functions. Sem isso, estima-se que de 10% a 20% das chamadas em redes restritivas não conectem.

## Problemas comuns

| Sintoma | Causa provável | O que olhar |
|---|---|---|
| Fica em "Conectando" para sempre | Rede bloqueia conexão direta e não há TURN | `?debug=1` (estado ICE `failed`); configurar TURN |
| "Permissão negada" | Navegador bloqueou o microfone | Cadeado na barra de endereço → permitir microfone |
| Vídeo preto do outro lado | Câmera desligada ou ocupada por outro app | Ícone de câmera desligada; fechar o outro app |
| "Não foi possível abrir a sala" (consulta) | Fora do horário ou consulta não confirmada | `appointments.status` e horário; janela de 10 min antes até 15 min depois do fim |
| A chamada encerrou sozinha | Tempo do SOS esgotado ou os dois sem sinal por 10 min | `emergency_requests.end_reason` (`time_limit`, `abandoned`) |
