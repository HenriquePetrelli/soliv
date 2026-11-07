# Roteiro de testes do app

Formato: **quem → onde → o que fazer** ⇒ resultado esperado. Marque `[x]` quando passar.
Se falhar, a ficha indicada em cada seção (`docs/fluxos/`) diz o que olhar.

**Contas necessárias:** Paciente A (Completo), Paciente B (Essencial), Paciente C (sem plano), Psicólogo aprovado, Admin.
**Aparelhos:** dois (ou dois navegadores, um em janela anônima). Um celular para push.

O mesmo roteiro está no checklist interativo (mesmos itens e códigos `sNN-MM`). Os testes **sem internet** e de **push** ficam juntos nas seções 20 e 21, para fazer de uma vez: desligar a rede uma vez só, e testar o push com o app fechado e a tela bloqueada.

---

## 1. Contas e acesso (ficha 01)


- [ ] `s01-01` Visitante → Cadastro paciente → senha `abc123` ⇒ recusa (mínimo 8)
- [ ] `s01-02` Visitante → Cadastro paciente → senha `calma2024` ⇒ entra na Home
- [ ] `s01-03` Visitante → Login → senha errada ⇒ "Email ou senha incorretos"
- [ ] `s01-04` Visitante → Login → Esqueci a senha → link do e-mail → nova senha ⇒ entra com ela
- [ ] `s01-16` E-mail de redefinir senha ⇒ em português, com a logo do Soliv (sem domínio próprio só chega a quem é da equipe do Supabase)
- [ ] `s01-17` Visitante → Cadastro paciente → preenchimento automático do navegador (endereço) ⇒ estado **e** cidade preenchidos
- [ ] `s01-05` Paciente → Perfil → Sair ⇒ "Saindo da conta..." aparece na hora; volta ao login; botão voltar não reabre o app
- [ ] `s01-06` Psicólogo em análise → Login ⇒ só o aviso "Seu cadastro ainda está sendo analisado" (sem "Erro ao verificar assinatura" nem tela de erro)
- [ ] `s01-07` Paciente → abrir `/admin-dashboard` na barra ⇒ redirecionado
- [ ] `s01-08` Visitante → Cadastro psicólogo → enviar documentos + aceitar termos do psicólogo ⇒ cadastro enviado, volta ao login (sem carregamento infinito)
- [ ] `s01-19` Cadastro psicólogo → anexar arquivo inválido (ex.: `.exe` ou grande demais) ⇒ aviso em vermelho e campo limpo
- [ ] `s01-20` Cadastro psicólogo → anexar documento válido ⇒ "Arquivo escolhido: nome"; documento aparece para o admin
- [ ] `s01-21` Cadastro psicólogo → preenchimento automático do navegador ⇒ estado e cidade preenchidos
- [ ] `s01-09` Psicólogo bloqueado → Login ⇒ vê o motivo e não entra
- [ ] `s01-10` Paciente → Perfil → Conta → Meus sintomas → Confirmar ⇒ a janela fecha e aparece "Sintomas atualizados" no perfil
- [ ] `s01-11` Paciente → Perfil → Preferências → Tema → escuro ⇒ app inteiro muda de tema
- [ ] `s01-12` Paciente → Perfil → Preferências → Humor diário → desligar ⇒ Home não pede mais o humor
- [ ] `s01-13` Psicólogo → Perfil → Alterar senha (senha atual errada) ⇒ recusa; certa ⇒ troca
- [ ] `s01-22` Paciente → Configurações da conta → Alterar senha com `abc123` ⇒ recusa (mínimo 8)
- [ ] `s01-23` Paciente → Configurações da conta → editar nome → salvar ⇒ Perfil mostra o nome novo
- [ ] `s01-24` Conta que ainda não aceitou a versão atual dos termos → entrar ⇒ pede o aceite antes de usar o app
- [ ] `s01-25` Abrir qualquer tela pela primeira vez ⇒ esqueleto de carregamento com o formato da própria tela
- [ ] `s01-26` Com "Confirmar e-mail" ligado → cadastro de paciente ⇒ "Conta criada! Enviamos um link..."; depois de confirmar e entrar, CPF, cidade e sintomas estão no perfil
- [ ] `s01-27` Cadastro de paciente com CPF já usado ⇒ nenhuma conta é criada; aviso para entrar ou recuperar a senha
- [ ] `s01-28` Com "Confirmar e-mail" ligado → cadastro de psicólogo → confirmar → entrar ⇒ tela "Falta pouco" pede o documento do CRP; ao enviar, vai para análise
- [ ] `s01-29` Admin bloqueia um paciente que está com o app aberto ⇒ em até 5 minutos (ou ao voltar para o app) vê o motivo e sai da conta; não consegue entrar de novo até o fim do bloqueio
- [ ] `s01-30` Admin desbloqueia ⇒ a pessoa entra normalmente
- [ ] `s01-31` Login com e-mail com espaço ou maiúscula ⇒ entra normalmente
- [ ] `s01-14` Psicólogo → Perfil → editar especialização e biografia → salvar ⇒ paciente vê os dados novos ao agendar
- [ ] `s01-15` Qualquer → abrir endereço inexistente (`/xyz`) ⇒ "Não encontramos esta página"; "Voltar para o início" leva à Home, ao painel ou ao login

## 2. SOS (fichas 02 e 03)


- [ ] `s02-29` Paciente → botão de SOS (celular e computador) ⇒ abre a confirmação "Precisa de ajuda agora?"; "Agora não" fecha sem pedir SOS
- [ ] `s02-01` Paciente A → SOS (sem psicólogo online) ⇒ "Nenhum psicólogo online agora" e o pedido continua na fila
- [ ] `s02-02` Psicólogo → Início → ficar Online ⇒ Paciente A vê "1 profissional disponível"
- [ ] `s02-03` Paciente A → SOS → pedir ajuda ⇒ pedido aparece no painel do psicólogo em até 10 s
- [ ] `s02-04` Psicólogo → Aceitar ⇒ os dois na sala, com vídeo e áudio
- [ ] `s02-05` Na chamada → mutar / desligar câmera ⇒ aparece do outro lado
- [ ] `s02-07` Na chamada → recarregar a página (F5) ⇒ volta à mesma sala, cronômetro continua
- [ ] `s02-08` Psicólogo → Encerrar ⇒ Paciente A vê a avaliação obrigatória
- [ ] `s02-09` Paciente A → SOS de novo no mesmo mês ⇒ tela "Você já usou o SOS deste mês" (sem busca), com CVV, respirar, plano de segurança e agendar consulta
- [ ] `s02-10` Paciente B → SOS → fechar o app antes do aceite ⇒ pedido some do painel do psicólogo
- [ ] `s02-23` Paciente B → SOS → Cancelar pedido ⇒ some do painel do psicólogo na hora (sem recarregar)
- [ ] `s02-11` Paciente B → SOS → esperar 10 min sem aceite ⇒ "Ninguém atendeu" + CVV + "Tentar de novo"
- [ ] `s02-12` Paciente B → SOS aceito → psicólogo fecha o app → 90 s ⇒ "Chamar outro psicólogo" (cota não é gasta)
- [ ] `s02-13` Paciente B → SOS → psicólogo aceita e encerra sem o paciente entrar ⇒ SOS do mês volta
- [ ] `s02-14` Paciente B → SOS na fila → abrir Respirar / Meu plano ⇒ pedido continua na fila
- [ ] `s02-15` Paciente C (sem plano) → SOS ⇒ não consegue pedir; convite para assinar
- [ ] `s02-17` Psicólogo → Início → desligar o status do SOS (Offline) ⇒ paciente vê "Nenhum psicólogo online agora"
- [ ] `s02-18` Psicólogo online → Sair da conta ⇒ fica Offline automaticamente
- [ ] `s02-19` Psicólogo → SOS aceito → Contexto do paciente ⇒ identificação, sintomas relatados e histórico de pedidos
- [ ] `s02-20` Na chamada → Configurações → trocar microfone/câmera ⇒ troca sem derrubar a chamada
- [ ] `s02-21` Paciente → encerrar SOS e fechar o app antes de avaliar → reabrir ⇒ pede a avaliação
- [ ] `s02-22` Admin → Atendimento → SOS ⇒ solicitações, atendidas, tempo até aceite e duração média
- [ ] `s02-24` Paciente → SOS em duas abas ao mesmo tempo ⇒ um pedido só na fila do psicólogo
- [ ] `s02-25` Psicólogo em um SOS → aceitar outro pedido (outra aba) ⇒ "Você já está em um atendimento de emergência"
- [ ] `s02-26` Psicólogo em análise ou bloqueado ⇒ não vê a fila do SOS
- [ ] `s02-27` Paciente → SOS aceito → cancelar antes de a chamada conectar ⇒ SOS do mês volta
- [ ] `s02-28` Paciente → Chamar outro psicólogo ⇒ o psicólogo que sumiu vê "Atendimento encaminhado" ao voltar para a sala
- [ ] `s02-30` SOS em andamento → paciente dá F5 (depois o psicólogo) ⇒ os dois voltam a se ver em poucos segundos
- [ ] `s02-32` SOS com os dois na sala mas sem áudio/vídeo (rede bloqueada) → 45 s ⇒ painel "A chamada não está conectando" com Tentar de novo / Chamar outro psicólogo / CVV
- [ ] `s02-33` Mesmo caso → paciente "Chamar outro psicólogo" ⇒ volta para a fila; SOS do mês não é gasto
- [ ] `s02-34` Mesmo caso → psicólogo "Encerrar por falha de conexão" ⇒ SOS do mês volta para o paciente
- [ ] `s02-35` Psicólogo entra e encerra sem o paciente aparecer no vídeo ⇒ SOS do mês volta; não entra no repasse
- [ ] `s02-37` Na chamada → desligar câmera e microfone → F5 ⇒ voltam desligados de verdade (luz da câmera apagada; o outro lado não ouve nem vê) e com os botões certos
- [ ] `s02-38` Na chamada → desligar a câmera / religar ⇒ a luz da câmera do aparelho apaga; ao religar a imagem volta dos dois lados
- [ ] `s02-39` Paciente e psicólogo lado a lado ⇒ cronômetro igual nos dois; antes de o segundo entrar mostra "25:00 · aguardando"; pausa se um cair
- [ ] `s02-40` Na chamada → redimensionar, maximizar, minimizar e voltar para a janela ⇒ continua na chamada
- [ ] `s02-41` Psicólogo online em consulta agendada (em andamento) → paciente pede SOS ⇒ O paciente não conta esse psicólogo como disponível e ele não recebe push
- [ ] `s02-42` Psicólogo em consulta → aceitar SOS (outra aba) ⇒ "Você está em uma consulta agora. Termine a consulta antes de aceitar um SOS."
- [ ] `s02-43` Paciente com plano já vencido (antes da rotina diária) → SOS ⇒ Não consegue pedir; convite para assinar
- [ ] `s02-44` Na chamada → aba Rede → resposta de ice-servers ⇒ "turn": true (com TURN configurado); uma conta sem sala de chamada recente recebe "turn": false
- [ ] `s02-45` Paciente → SOS conectado normalmente → "Chamar outro psicólogo" antes de 90 s ⇒ "O psicólogo ainda está conectado" (o SOS do mês não volta)
- [ ] `s02-46` Confirmação do SOS → "Sim, chamar um psicólogo" sem marcar nada ⇒ O pedido entra na fila normalmente
- [ ] `s02-47` Confirmação → marcar "Pensamentos de suicídio ou de me machucar" ⇒ SAMU 192 e CVV 188 aparecem na hora e continuam em destaque na espera
- [ ] `s02-48` Confirmação → marcar "Estou em perigo ou sofri violência" ⇒ Aparecem Polícia 190 e Ligue 180
- [ ] `s02-49` Psicólogo → fila com dois pedidos, um com suicídio marcado ⇒ Esse aparece primeiro, com "PRIORITÁRIO" e as opções marcadas
- [ ] `s02-50` Psicólogo → aceitar → Contexto do paciente ⇒ "O que está sentindo agora" no topo
- [ ] `s02-51` Paciente → SOS → "Por mensagem" → Sim ⇒ fila diz "a conversa abre sozinha"; psicólogo vê "Por mensagem" no pedido
- [ ] `s02-52` Psicólogo aceita um SOS por mensagem ⇒ os dois entram numa conversa em tela cheia (sem câmera); psicólogo vê "O atendimento começa quando você enviar a primeira mensagem"
- [ ] `s02-53` Paciente escreve → psicólogo responde ⇒ só na resposta começa o relógio de 25:00 e o SOS do mês é usado
- [ ] `s02-54` Um lado digita / lê ⇒ o outro vê "digitando…"; a última mensagem lida mostra "Visto"
- [ ] `s02-55` Psicólogo troca de app por 1 min ⇒ paciente vê "O psicólogo pode ter se afastado" com "Chamar outro psicólogo" e CVV 188; psicólogo recebe push "Volte ao atendimento"
- [ ] `s02-56` Paciente escreve e o psicólogo não responde por 2 min ⇒ push "O paciente está esperando sua resposta"; paciente pode chamar outro psicólogo (SOS devolvido)
- [ ] `s02-58` Paciente sai da conversa e o psicólogo responde ⇒ depois de 1 min, push "Você tem uma nova mensagem"
- [ ] `s02-59` Psicólogo → Encerrar a conversa ⇒ crise resolvida, observações e "Deixar um plano pós-crise"; paciente vê "O psicólogo encerrou a conversa" e a avaliação
- [ ] `s02-60` Conversa de 6 min com 3 respostas do psicólogo / de 3 min ⇒ a de 6 min entra no repasse; a de 3 min não
- [ ] `s02-61` Abrir o link de uma conversa do SOS já encerrada ⇒ "Esta conversa do SOS já foi finalizada" e volta ao início

## 3. Consultas agendadas (fichas 04 e 05)


- [ ] `s03-01` Psicólogo → Agenda → definir horário-padrão → salvar
- [ ] `s03-02` Psicólogo → Agenda → Agenda semanal → bloquear 14h de amanhã ⇒ paciente não vê 14h amanhã
- [ ] `s03-32` Psicólogo → Agenda → Agenda semanal ⇒ sem os botões "Editar horário padrão" e "Tirar férias"
- [ ] `s03-03` Psicólogo → Agenda → Férias → escolher de-até → Agendar férias ⇒ nenhum horário nesses dias; cartão "Férias agendadas" na Agenda
- [ ] `s03-33` Psicólogo → Agenda → Férias → Cancelar férias ⇒ horários voltam
- [ ] `s03-34` Psicólogo → Agenda → Férias com início depois do fim ⇒ recusado
- [ ] `s03-35` Paciente A pede 10h → Paciente B abre o mesmo psicólogo e dia ⇒ 10h aparece ocupado
- [ ] `s03-36` Psicólogo propõe 15h ao Paciente A → Paciente B abre o mesmo dia ⇒ 15h aparece ocupado
- [ ] `s03-37` Paciente com o aparelho no fuso de Manaus ⇒ horários iguais aos do psicólogo (Brasília)
- [ ] `s03-38` Psicólogo com "até 60 dias à frente" ⇒ paciente consegue escolher dia depois de 30 dias
- [ ] `s03-39` Paciente → horário que outro paciente acabou de pegar → Agendar ⇒ "Este horário já está ocupado" e a lista atualiza
- [ ] `s03-40` Paciente → pedido com novo horário proposto, depois do horário original → Cancelar ⇒ cancela e a consulta do mês volta
- [ ] `s03-42` Consulta → conversar 10 min e encerrar ⇒ "Consulta finalizada"; entra no repasse
- [ ] `s03-43` Psicólogo → Concluir uma consulta com chamada de 2 min ⇒ recusado, com orientação para marcar como interrompida
- [ ] `s03-44` Consulta com os dois na sala e sem áudio/vídeo por 45 s ⇒ "A chamada não está conectando"; psicólogo "Marcar como interrompida" ⇒ paciente avisado, sem erro ao sair
- [ ] `s03-45` Consulta → mutar / desligar câmera ⇒ fica gravado na sala
- [ ] `s03-46` Chamada (SOS e consulta) → desligar e religar a câmera ⇒ a miniatura "Você" volta a mostrar o vídeo na hora
- [ ] `s03-47` Chamada → o outro lado muta ⇒ ícone vermelho de microfone ao lado do nome dele; barras quando fala
- [ ] `s03-48` Psicólogo → Contexto do paciente ⇒ tela dividida (contexto à esquerda, vídeo à direita; no celular embaixo) e fecha pelo X
- [ ] `s03-49` SOS e consulta → cronômetro ⇒ SOS 25:00 em qualquer plano; consulta 50:00
- [ ] `s03-50` Chamada → Ctrl+D e Ctrl+E ⇒ muta o microfone e desliga a câmera; sem botão de diagnóstico
- [ ] `s03-51` Paciente com Consultas aberta → psicólogo aceita (ou propõe outro horário) ⇒ a lista do paciente muda sozinha, sem recarregar
- [ ] `s03-52` Psicólogo com Início/Consultas aberto → paciente pede consulta ⇒ o pedido aparece sozinho
- [ ] `s03-53` Psicólogo abre um pedido → paciente cancela → psicólogo toca em Aceitar ⇒ "Esta consulta mudou enquanto você respondia"; a consulta continua cancelada
- [ ] `s03-55` Psicólogo propõe a um paciente um horário que outro paciente está pedindo ao mesmo tempo ⇒ só um dos dois consegue
- [ ] `s03-56` Consulta com lembrete de 24 h já enviado → paciente aceita novo horário ⇒ recebe os lembretes do horário novo
- [ ] `s03-57` Pedido sem resposta por 24 h ⇒ paciente avisado e psicólogo recebe "Pedido de consulta expirou"
- [ ] `s03-58` Psicólogo → Histórico → resumo da sessão ⇒ aviso de que o paciente vê o resumo
- [ ] `s03-59` Psicólogo com consulta marcada → Agenda → Férias cobrindo o dia ⇒ o modal lista a consulta antes de confirmar; com "Cancelar essas consultas" marcado, o paciente é avisado e a consulta do mês volta
- [ ] `s03-60` Férias desmarcando "Cancelar essas consultas" ⇒ as consultas continuam marcadas, com aviso ao psicólogo
- [ ] `s03-61` Psicólogo → Agenda semanal → bloquear o horário de uma consulta marcada (inclusive pela API) ⇒ recusado: "Esse horário tem consulta marcada"
- [ ] `s03-62` Visitante sem login → ler férias/horários dos psicólogos pela API ⇒ nada retorna
- [ ] `s03-04` Paciente A → Consultas → Agendar → psicólogo → horário ⇒ "Aguardando confirmação"
- [ ] `s03-28` Paciente A → Consultas → Agendar → lista de psicólogos ⇒ mostra consultas, SOS atendidos e a nota real (ou "Sem avaliações ainda"); não mostra cidade nem estado
- [ ] `s03-05` Paciente A → Consultas → Agendar (toque duplo rápido) ⇒ só uma consulta criada
- [ ] `s03-06` Paciente A → Consultas → Agendar outra no mês ⇒ aviso de cota usada
- [ ] `s03-07` Paciente B (Essencial) → Consultas → Agendar ⇒ "disponível nos planos Flex e Completo"
- [ ] `s03-08` Psicólogo → Consultas → Próximas → pedido → Aceitar ⇒ paciente recebe "Consulta confirmada"
- [ ] `s03-09` Psicólogo → Consultas → pedido → Propor outro horário → Paciente aceita ⇒ horário muda nos dois
- [ ] `s03-10` Psicólogo → Consultas → pedido → Recusar ⇒ consulta do mês volta para o paciente
- [ ] `s03-11` Paciente A → Consultas → Cancelar (mais de 24 h antes) ⇒ aviso "a consulta do mês volta"
- [ ] `s03-12` Paciente A → Consultas → Cancelar (menos de 24 h antes) ⇒ aviso "conta como usada"
- [ ] `s03-13` Psicólogo → Consultas → Cancelar consulta confirmada ⇒ paciente avisado, consulta do mês volta
- [ ] `s03-14` Os dois → 10 min antes → Entrar ⇒ chamada conecta
- [ ] `s03-15` Psicólogo → Encerrar ⇒ paciente avalia (nota + comentário)
- [ ] `s03-17` Psicólogo sozinho → sair da sala ⇒ "Você saiu da sala"; consulta segue "Em andamento"
- [ ] `s03-18` Ninguém conecta → 30 min após o fim ⇒ "Não realizada", consulta do mês volta
- [ ] `s03-19` Paciente A → Consultas → Histórico → Avaliar ⇒ nota entra na média do psicólogo
- [ ] `s03-20` Paciente A → Consultas → Histórico → Relatar problema ⇒ psicólogo é avisado
- [ ] `s03-21` Psicólogo → Consultas → Histórico → Consulta interrompida ⇒ consulta do mês volta ao paciente
- [ ] `s03-22` Psicólogo → Consultas → Histórico → Salvar resumo da sessão ⇒ salva sem mudar o status
- [ ] `s03-24` Psicólogo → Consultas → consulta → Histórico do paciente ⇒ consultas anteriores e resumos
- [ ] `s03-25` Paciente → encerrar consulta e fechar o app antes de avaliar → reabrir ⇒ convite para avaliar (pode pular)
- [ ] `s03-26` Psicólogo → Agenda → antecedência mínima 2 h ⇒ paciente não marca para daqui a 1 h
- [ ] `s03-27` Psicólogo → Notificações ⇒ pedidos, confirmações e lembretes listados
- [ ] `s03-29` Psicólogo (celular) → barra inferior ⇒ Início, Consultas, Agenda, Chat e Perfil; no computador, menu lateral com Pagamentos e o status do SOS
- [ ] `s03-30` Psicólogo online → abrir Agenda ou Chat → paciente pede SOS ⇒ aviso "pedido de SOS esperando" leva ao Início
- [ ] `s03-31` Psicólogo → Chat ⇒ abre com a navegação do psicólogo (sem a barra e o SOS do paciente)
- [ ] `s03-63` Psicólogo → Histórico → consulta concluída → escrever resumo e anotação privada → Salvar ⇒ O paciente vê o resumo no histórico dele, mas não a anotação
- [ ] `s03-64` Psicólogo → consulta seguinte com o mesmo paciente → Contexto do paciente ⇒ Mostra o resumo e a anotação privada ("só você vê") das sessões anteriores
- [ ] `s03-65` Paciente Completo com cancelamento agendado → agendar consulta depois do fim do plano ⇒ "Seu plano termina em DD/MM. Agende até essa data ou renove o plano."

## 4. Chat (ficha 06)


- [ ] `s04-01` Paciente C (sem consulta concluída) → Chat → iniciar com psicólogo ⇒ não permite
- [ ] `s04-02` Paciente A (consulta concluída) → Chat → nova conversa → "oi" ⇒ chega na hora, com contador
- [ ] `s04-03` Psicólogo → Chat → abrir conversa ⇒ no paciente, dois checks
- [ ] `s04-04` Paciente A → Chat → enviar foto (celular/iPhone) ⇒ abre do outro lado
- [ ] `s04-07` Paciente A → Chat → excluir conversa ⇒ some só para ele; volta se o psicólogo escrever
- [ ] `s04-08` Conversa com mais de 1 mês sem nova consulta ⇒ "Somente leitura" (conferir no banco, ficha 06)
- [ ] `s04-09` Paciente A → Chat → enviar foto ⇒ abre para o psicólogo; outra conta (Paciente B) não consegue abrir o link da foto
- [ ] `s04-10` Foto enviada antes desta versão ⇒ continua abrindo para os dois participantes
- [ ] `s04-11` Conversa somente leitura → tentar enviar ⇒ caixa de texto bloqueada; se insistir pela API, "Esta conversa está somente leitura"
- [ ] `s04-14` Conversa aberta em aba de fundo → chega mensagem → voltar à aba ⇒ do outro lado: um check enquanto em fundo; dois ao voltar
- [ ] `s04-15` Lendo mensagens antigas → chega mensagem ⇒ a tela não pula; aparece "1 nova mensagem"
- [ ] `s04-16` Abrir conversa → voltar do celular / recarregar ⇒ volta para a lista / continua na conversa
- [ ] `s04-18` Caixa de texto: Enter e Shift+Enter ⇒ Enter envia; Shift+Enter quebra a linha
- [ ] `s04-19` Escrever uma mensagem sem enviar → sair da conversa (ou recarregar) → voltar ⇒ o texto continua na caixa
- [ ] `s04-20` Mandar foto grande do celular (8–12 MB) ⇒ é reduzida e enviada (antes: recusada acima de 5 MB)
- [ ] `s04-21` Deixar a conversa aberta mais de 1 hora → abrir uma foto ⇒ continua abrindo
- [ ] `s04-22` Conversa com mais de 200 mensagens → abrir ⇒ mostra as mais recentes; "Ver mensagens anteriores" traz as antigas sem pular a tela
- [ ] `s04-23` Sair da conta com mensagem "Não enviada" → entrar com outra conta no mesmo aparelho ⇒ nada da conta anterior aparece nem é enviado
- [ ] `s04-24` Abrir link de conversa apagada (ou de outra pessoa) ⇒ "Conversa não encontrada" com botão para a lista
- [ ] `s04-25` Conversa aberta em aba de fundo → chega mensagem ⇒ aviso do navegador discreto (sem texto nem nome)
- [ ] `s04-26` Paciente ocultou a conversa → nova consulta concluída ⇒ a conversa volta para a lista dele, ativa

## 5. Notificações no app (ficha 07)


- [ ] `s05-04` Paciente → Notificações ⇒ lista com não lidas; tocar leva à tela certa
- [ ] `s05-06` App aberto em outra tela → chega um aviso ⇒ aparece na tela com "Abrir"
- [ ] `s05-09` Notificações → abrir um aviso não lido ⇒ o número do sino baixa na hora
- [ ] `s05-10` Notificações no celular ⇒ cada aviso tem o botão de excluir visível
- [ ] `s05-11` Notificações → Excluir todas ⇒ pede confirmação antes de apagar

## 6. Assinaturas (ficha 08)


- [ ] `s06-01` Paciente C → Planos → Essencial → pagar ⇒ tela de sucesso; Perfil mostra Essencial
- [ ] `s06-02` Paciente → Planos → subir para Completo ⇒ prévia do valor proporcional → Completo na hora
- [ ] `s06-03` Paciente → Planos → descer para Essencial ⇒ "vale na renovação"
- [ ] `s06-04` Paciente → Planos → Cancelar (após 7 dias) ⇒ Perfil e Planos mostram "Plano cancelado - Essencial disponível até dd/mm/aaaa" → "Manter" desfaz
- [ ] `s06-05` Plano cancelado → passar a data de fim (relógio de teste do Stripe) ⇒ Perfil mostra "Plano Grátis"; SOS pede plano
- [ ] `s06-06` Paciente → Planos → Cancelar (até 7 dias) ⇒ acaba na hora, reembolso no Stripe
- [ ] `s06-07` Cartão `4000 0000 0000 0341` na renovação ⇒ aviso para atualizar o cartão
- [ ] `s06-08` Paciente → Planos → assinar → fechar o checkout sem pagar ⇒ "Pagamento não concluído", plano não muda
- [ ] `s06-09` Paciente → Planos → Gerenciar pagamento ⇒ abre o portal do Stripe
- [ ] `s06-11` Paciente → Planos → Assinar (toque duplo rápido) ⇒ um checkout só; no Stripe, uma assinatura
- [ ] `s06-10` Psicólogo e admin → entrar ⇒ nenhum aviso de assinatura
- [ ] `s06-19` Paciente Completo com consulta marcada → cancelar em até 7 dias ⇒ aviso de que a consulta também será cancelada; depois do cancelamento, o psicólogo recebe "Consulta cancelada"
- [ ] `s06-13` Plano termina (fim do período, arrependimento ou saída da empresa) ⇒ aviso "Seu plano terminou" com link para os planos
- [ ] `s06-14` Paciente com Completo da empresa → tentar assinar Essencial, Flex ou Completo pela API ⇒ "Seu plano já vem da empresa"; nenhum checkout
- [ ] `s06-15` Conta A troca de e-mail → conta B se cadastra com o e-mail antigo → B abre o app ⇒ A continua com o plano e o cliente do Stripe dela; B ganha linha própria, sem plano
- [ ] `s06-16` Completo com consulta marcada depois do fim do período → Cancelar assinatura ⇒ A tela avisa que a consulta será cancelada quando o plano terminar
- [ ] `s06-17` Mesmo caso, 3 dias antes do fim ⇒ Aviso "Consulta depois do fim do plano" (uma vez)
- [ ] `s06-18` Mesmo caso, quando o plano termina ⇒ Consulta cancelada; paciente recebe "Consultas canceladas" e o psicólogo "o plano do paciente terminou"
- [ ] `s06-12` Conta A com assinatura troca de e-mail → conta B se cadastra com o e-mail antigo ⇒ B fica sem plano (não herda o de A)

## 7. Repasses (ficha 09)


- [ ] `s07-01` Admin → Financeiro → Repasses → Sincronizar ⇒ psicólogo com consulta (R$ 85) + SOS (R$ 40)
- [ ] `s07-02` Admin → Repasses → Sincronizar de novo ⇒ valor não duplica
- [ ] `s07-03` Admin → Repasses → Confirmar → E2E de 32 caracteres + comprovante ⇒ pendente zera
- [ ] `s07-04` Admin → Repasses → Confirmar com o mesmo E2E ⇒ recusado
- [ ] `s07-05` Psicólogo → Pagamentos ⇒ vê "Repasses recebidos" com E2E e comprovante
- [ ] `s07-06` Consulta/SOS em que o psicólogo ficou sozinho ⇒ não entra no repasse
- [ ] `s07-07` Psicólogo → Perfil → Chave Pix → trocar ⇒ Admin vê a chave nova em Repasses
- [ ] `s07-08` Consulta concluída já sincronizada (ainda não paga) → Psicólogo → Histórico → Consulta interrompida ⇒ aceita; sai do pendente e a consulta do mês volta ao paciente
- [ ] `s07-09` Consulta já paga → Consulta interrompida ⇒ recusado: "já foi paga no repasse, fale com o suporte"
- [ ] `s07-10` Admin confirma com valor desatualizado (outra aba sincronizou antes) ⇒ "O valor pendente mudou"; nada é pago
- [ ] `s07-11` Admin → Confirmar → conferir no banco ⇒ itens do psicólogo com paid_at e o registro com o E2E
- [ ] `s07-12` SOS concluído com menos de 5 min de chamada (os dois conectados) → Sincronizar ⇒ Não entra no repasse; com 5 min ou mais, entra (R$ 40)
- [ ] `s07-13` Admin → excluir psicólogo com repasses ⇒ Some do painel; archived_psychologist_payouts tem uma linha com nome, CPF e os pagamentos
- [ ] `s07-14` Admin → excluir psicólogo com consulta passada e consulta futura de um paciente ⇒ O paciente continua vendo a passada no histórico (com nome e resumo); a futura aparece cancelada, ele recebe "o psicólogo não atende mais pelo Soliv" e a consulta do mês volta

## 8. Empresas / B2B (ficha 10)


- [ ] `s08-01` Admin → Empresas → criar "Teste" (Completo, 2 vagas, domínio `empresa.com`) ⇒ gera código
- [ ] `s08-02` Visitante → Cadastro com código + `ana@empresa.com` ⇒ entra Completo
- [ ] `s08-03` Visitante → Cadastro com código + `joao@gmail.com` ⇒ recusa pelo domínio
- [ ] `s08-04` Terceira pessoa com o código (2 vagas ocupadas) ⇒ "As vagas acabaram"
- [ ] `s08-05` RH → Portal da empresa → desligar colaborador ⇒ vaga volta; plano vale até o fim do mês
- [ ] `s08-10` Colaborador desligado pelo RH → usar o mesmo código de novo ⇒ "Seu acesso ao benefício desta empresa foi encerrado pelo RH"
- [ ] `s08-11` Colaborador → Sair do benefício → usar o código de novo ⇒ volta a ter o plano
- [ ] `s08-12` Com "Confirmar e-mail" ligado → cadastro com e-mail @empresa e o código ⇒ a vaga só é ocupada depois de confirmar o e-mail; ao confirmar, entra Completo sozinho
- [ ] `s08-13` Paciente com e-mail não confirmado → Benefício da empresa → código de empresa com domínio ⇒ "Confirme o seu e-mail para usar o benefício da empresa"
- [ ] `s08-06` Admin → Empresas → pausar contrato ⇒ colaboradores perdem o plano
- [ ] `s08-07` 21 códigos errados seguidos ⇒ "Muitas tentativas de código"
- [ ] `s08-08` Paciente já cadastrado → Perfil → Benefício da empresa → digitar código ⇒ vira Completo
- [ ] `s08-09` Paciente → Benefício da empresa → Sair do benefício ⇒ perde o plano da empresa na hora e libera a vaga

## 9. Meus hábitos (ficha 11)


- [ ] `s09-01` Paciente → Home → Meus hábitos → Água → tocar copo ⇒ anel avança; Desfazer volta
- [ ] `s09-02` Paciente → Hábitos → Parar de fumar (início há 3 dias) ⇒ "3 dias", dinheiro economizado
- [ ] `s09-03` Parar de fumar → Senti vontade ⇒ registra e oferece respiração
- [ ] `s09-04` Parar de fumar → Recaída ⇒ contagem recomeça, recorde mantido
- [ ] `s09-06` Cafeína acima de 400 mg ⇒ anel vermelho e aviso
- [ ] `s09-07` Criar um hábito de cada tipo (sono, movimento, refeições, telas, algo que me faz bem) ⇒ cada um registra
- [ ] `s09-08` Hábito → Editar → mudar meta ⇒ salva; Excluir ⇒ some da lista
- [ ] `s09-11` Água → tocar copo e "Desfazer" na hora ⇒ o copo não volta depois
- [ ] `s09-12` Abrir /habitos/novo/water com Água já na lista ⇒ "Esse hábito já está na sua lista"
- [ ] `s09-13` Hábito → Tirar da minha lista → Apagar com o histórico ⇒ pede confirmação e apaga tudo
- [ ] `s09-14` Parar de fumar → Recaída tocando duas vezes rápido ⇒ conta uma recaída só
- [ ] `s09-15` Sono anotado de manhã ⇒ não chega "Como você dormiu?" no horário do lembrete
- [ ] `s09-18` App aberto de um dia para o outro ⇒ depois da meia-noite a água volta a zero sem recarregar

## 10. Meu progresso (ficha 12)


- [ ] `s10-01` Paciente → Home → registrar humor ⇒ aparece em Progresso
- [ ] `s10-02` Abrir o app dois dias seguidos ⇒ sequência = 2
- [ ] `s10-03` Progresso → Metas → "Respiração 3x" → fazer respiração ⇒ barra sobe 1
- [ ] `s10-04` Primeira respiração concluída ⇒ conquista "Primeiro Passo" com aviso
- [ ] `s10-05` Progresso → Histórico completo ⇒ respiração, humor e hábitos do dia
- [ ] `s10-06` Progresso → Metas da semana → escolher um desafio de 7 dias → "Fiz o passo de hoje" ⇒ avança 1 passo
- [ ] `s10-07` Progresso → Seus padrões (após alguns dias de registros) ⇒ mostra o que anda junto com os dias melhores
- [ ] `s10-08` Progresso → Conquistas ⇒ lista com progresso de cada conquista
- [ ] `s10-09` Humor diário → registrar duas vezes no mesmo dia ⇒ a meta sobe 1 só; a média conta o último valor
- [ ] `s10-10` Às 22h → Meu progresso ⇒ as metas da semana continuam aparecendo
- [ ] `s10-11` Domingo → escolher um desafio → fazer o passo → abrir na segunda ⇒ o passo continua feito
- [ ] `s10-12` Semana nova (domingo) ⇒ as metas escolhidas voltam zeradas, sem escolher de novo
- [ ] `s10-13` Escolher metas tocando duas vezes em Salvar ⇒ cada meta aparece uma vez só

## 11. Questionários (ficha 13)


- [ ] `s11-01` Paciente → Progresso → Questionários → GAD-7 tudo 0 ⇒ "Mínimos"
- [ ] `s11-02` Questionários → PHQ-9 tudo 2 ⇒ 18, "Moderadamente graves", sugere consulta
- [ ] `s11-03` PHQ-9 com pergunta 9 = 1 ⇒ apoio imediato com CVV e SOS
- [ ] `s11-04` Ligar "mostrar aos meus psicólogos" ⇒ psicólogo com consulta vê o resultado
- [ ] `s11-05` PHQ-9 → marcar a pergunta 9 acima de "Nenhuma vez" ⇒ o apoio (CVV e SOS) aparece na hora, antes de enviar
- [ ] `s11-07` Responder metade → sair da tela → voltar ⇒ as respostas continuam marcadas
- [ ] `s11-08` Compartilhamento ligado → responder de novo no mês seguinte ⇒ o novo resultado também aparece para o psicólogo
- [ ] `s11-09` Psicólogo que só recusou um pedido de consulta ⇒ não vê os resultados compartilhados
- [ ] `s11-10` Questionários → Apagar meus resultados deste questionário ⇒ pede confirmação e apaga tudo

## 12. Plano de segurança (ficha 14)


- [ ] `s12-01` Paciente → Home → Plano de segurança → criar (2 razões, 1 contato) → Ver → Ligar ⇒ abre discador
- [ ] `s12-02` Criar segundo plano ⇒ os dois na lista
- [ ] `s12-03` SOS em andamento → Psicólogo → painel do paciente → Plano de segurança ⇒ vê o plano
- [ ] `s12-04` SOS encerrado → Psicólogo tenta abrir o plano ⇒ não consegue
- [ ] `s12-07` Editor → escrever → sair sem salvar → voltar ⇒ o que foi escrito volta
- [ ] `s12-08` Editor com alteração → fechar a aba ⇒ o navegador pergunta antes de sair
- [ ] `s12-09` Mesmo plano em dois aparelhos → salvar num, depois no outro ⇒ "O plano mudou em outro aparelho", nada apagado
- [ ] `s12-11` Psicólogo na chamada (SOS ou consulta) → "Plano pós-crise" (escudo, ao lado do contexto) → 2 itens → Salvar ⇒ "Plano salvo"; o paciente ainda não vê nada
- [ ] `s12-12` Paciente na chamada ⇒ não tem o botão "Plano pós-crise"
- [ ] `s12-13` Encerrar o atendimento ⇒ paciente recebe "Seu psicólogo deixou um plano para você" (push neutro); Planos de segurança mostra "Recomendados para você" com "Recomendado por [nome]"
- [ ] `s12-14` Recomendação → "Editar antes de salvar" → mudar o título → salvar ⇒ entra na lista com o selo e "editado por você"
- [ ] `s12-15` Outra recomendação → "Agora não" ⇒ some da tela
- [ ] `s12-16` Paciente com 10 planos → "Salvar nos meus planos" ⇒ pede qual plano substituir
- [ ] `s12-17` Psicólogo → Histórico → detalhe do atendimento ⇒ vê o plano que recomendou; até 2 h depois ainda edita; depois que o paciente decidiu, não edita

## 13. Autocuidado (ficha 15)


- [ ] `s13-01` Paciente → Home → Respiração 4-7-8 até o fim ⇒ conclusão; tempo sobe em Progresso
- [ ] `s13-02` Paciente → Sons → tocar um de cada categoria ⇒ áudio toca
- [ ] `s13-03` Sons → terminar um som ⇒ "Como você se sente?"
- [ ] `s13-04` Sons → tocar uma playlist ⇒ passa para o próximo som sozinho
- [ ] `s13-05` Paciente → Comer com atenção → até o fim ⇒ tela de conclusão
- [ ] `s13-06` Paciente → Diário → 2 anotações → 3ª no mesmo dia ⇒ recusa, texto fica na janela
- [ ] `s13-07` Psicólogo ⇒ não tem acesso ao diário do paciente
- [ ] `s13-08` Respiração de 5 min com o celular bloqueado ⇒ ao desbloquear depois de 5 min, já está concluída
- [ ] `s13-09` Respiração ⇒ a tela não apaga sozinha durante a prática
- [ ] `s13-10` Respiração → "Terminar agora" depois de 2 min ⇒ conclusão com 2 minutos, que somam em Progresso
- [ ] `s13-11` Sons → "Dormir" 15 min → bloquear o celular ⇒ o som para sozinho em 15 min
- [ ] `s13-12` Sons → sair depois de 3 min ⇒ "Como você se sente?" e 3 min em Progresso
- [ ] `s13-13` Sons → "Como você se sente?" → voltar e avançar ⇒ o tempo não soma de novo
- [ ] `s13-14` Diário → escrever → fechar sem salvar → abrir de novo ⇒ o texto volta

## 14. Grupos de apoio (ficha 16)


- [ ] `s14-01` Paciente A → Grupos → grupo → depoimento anônimo ⇒ Paciente B vê "Anônimo"
- [ ] `s14-02` Paciente B → "Me ajudou" ⇒ contador sobe; de novo não duplica
- [ ] `s14-03` Paciente B → trocar para "Não me ajudou" ⇒ contadores trocam (e mantêm ao recarregar)
- [ ] `s14-04` Paciente B → Denunciar ⇒ Admin → Moderação → Grupos de apoio mostra a denúncia
- [ ] `s14-05` Admin → Grupos de apoio → editar / excluir ⇒ todos veem a mudança
- [ ] `s14-06` Paciente A → 6 depoimentos seguidos ⇒ o 6º é recusado
- [ ] `s14-07` Paciente → Grupos → favoritar ⇒ grupo vai para o topo
- [ ] `s14-08` Paciente B → tocar "Me ajudou" várias vezes bem rápido ⇒ sem erro e sem aviso a cada toque; ao recarregar, o contador bate com o botão
- [ ] `s14-09` Paciente sem Essencial/Flex/Completo → escrever ou reagir ⇒ bloqueado (também no servidor)
- [ ] `s14-10` Paciente A → escrever "penso em me matar" ⇒ quadro com "Ligar 188" e "Abrir o SOS"; publicar continua possível
- [ ] `s14-12` 3 pacientes → denunciar o mesmo depoimento ⇒ some para os outros; autor vê "Em análise"; admin descarta e volta

## 15. Suporte (ficha 17)


- [ ] `s15-01` Paciente → Perfil → Suporte → e-mail `abc` ⇒ recusa
- [ ] `s15-02` Suporte → descrição com `<a href="http://x.com">clique</a>` ⇒ e-mail mostra texto, sem link
- [ ] `s15-03` Suporte → enviar 4 vezes seguidas ⇒ a 4ª é recusada
- [ ] `s15-04` Psicólogo → Perfil → Suporte → enviar ⇒ e-mail chega

## 16. Privacidade e LGPD (ficha 18)


- [ ] `s16-01` Visitante → `/termos` e `/privacidade` ⇒ abrem sem login
- [ ] `s16-02` Paciente → Perfil → Configurações da conta → Baixar meus dados ⇒ JSON só com dados dele
- [ ] `s16-03` Paciente → Configurações → Excluir conta → senha errada ⇒ recusa
- [ ] `s16-04` Paciente (assinatura de teste) → Excluir conta → senha certa + EXCLUIR ⇒ sai; assinatura cancelada no Stripe
- [ ] `s16-05` Psicólogo → Excluir conta ⇒ orientado a falar com o suporte
- [ ] `s16-06` Paciente com conversa no chat → Baixar meus dados ⇒ o arquivo traz conversas, mensagens dos dois lados, aceites dos termos, benefício da empresa e pedidos de suporte
- [ ] `s16-07` Paciente → Excluir conta → conferir no banco ⇒ nada sobra em notification_logs, participant_presence e appointment_problem_reports com o id dele

## 17. Painel do admin (ficha 19)


- [ ] `s17-01` Admin → Login (primeira vez) ⇒ Tela "Ative a verificação em duas etapas" com QR code; ler no app autenticador e digitar o código ⇒ entra no painel
- [ ] `s17-31` Admin → sair e entrar de novo ⇒ Pede só o código de 6 dígitos; código errado ⇒ "Código inválido ou expirado" e não entra
- [ ] `s17-32` Admin → depois da senha, sem o código, abrir /admin-dashboard pelo endereço ⇒ Volta para a tela do código
- [ ] `s17-02` Admin → Visão geral ⇒ números carregam; "Psicólogos pendentes" leva à seção
- [ ] `s17-03` Admin → Pessoas → Psicólogos → aprovar ⇒ psicólogo entra; aparece em Auditoria
- [ ] `s17-04` Admin → Pessoas → Pacientes → bloquear 1 dia ⇒ paciente vê o motivo; Auditoria registra
- [ ] `s17-05` Admin → Pacientes → desbloquear ⇒ paciente entra normalmente
- [ ] `s17-06` Admin → Moderação → Chat ⇒ números e participantes, nenhum texto de mensagem
- [ ] `s17-07` Admin → Atendimento → SOS ⇒ métricas carregam
- [ ] `s17-08` Admin → recarregar numa seção ⇒ continua na mesma seção
- [ ] `s17-09` Admin → Psicólogos → abrir documentos de um pendente ⇒ documentos abrem
- [ ] `s17-16` Admin → Psicólogos → Pendentes ⇒ sem menu de ações na linha; detalhe só com Aprovar e Rejeitar
- [ ] `s17-17` Admin → Psicólogos / Pacientes → menu de ações → Bloquear → fechar sem escolher ⇒ a página continua respondendo aos cliques
- [ ] `s17-18` Admin → menu de ações → Excluir → Cancelar ⇒ a página continua respondendo aos cliques
- [ ] `s17-19` Admin → Psicólogos → Exportar CSV ⇒ baixa a planilha da aba atual
- [ ] `s17-10` Admin → Psicólogos → Rejeitar com motivo ⇒ psicólogo vê o motivo ao entrar
- [ ] `s17-11` Admin → Psicólogos → bloquear / editar ⇒ mudanças valem na hora; Auditoria registra
- [ ] `s17-12` Admin → Pacientes → Editar paciente → salvar ⇒ dados atualizados
- [ ] `s17-13` Admin → Pacientes / Psicólogos → excluir conta de teste ⇒ some e não entra mais
- [ ] `s17-14` Admin → Auditoria ⇒ ações de aprovação, bloqueio e edição listadas
- [ ] `s17-15` Admin → Notificações ⇒ avisos do admin listados
- [ ] `s17-20` Admin → sino (celular e computador) ⇒ abre Notificações dentro do painel, sem voltar para a Visão geral
- [ ] `s17-21` Admin no celular → barra inferior ⇒ Início, Psicólogos, Pacientes, Repasses e Mais; a aba aberta fica destacada
- [ ] `s17-22` Admin no celular → Mais ⇒ abre todas as seções (Empresas, SOS, Chat, Grupos, Auditoria, Meu perfil, Sair)
- [ ] `s17-23` Admin → Psicólogos com cadastro pendente ⇒ número aparece na aba Psicólogos da barra e do menu
- [ ] `s17-24` Admin → Meu perfil → Trocar senha com a senha atual errada ⇒ recusado; com a certa ⇒ "Senha atualizada"
- [ ] `s17-26` Paciente, psicólogo e admin com a tela a partir de 768 px ⇒ menu lateral no lugar da barra inferior
- [ ] `s17-27` Computador → rolar qualquer tela (paciente, psicólogo, admin) ⇒ cabeçalho com "soliv" e o sino fica fixo no topo
- [ ] `s17-28` Janela com rolagem (ex.: Agenda semanal) → rolar ⇒ título e X de fechar fixos em cima; botão de confirmar fixo embaixo
- [ ] `s17-29` Admin → aprovar/recusar psicólogo, confirmar repasse, editar/excluir depoimento, alterar empresa ⇒ cada ação aparece em Auditoria, com os detalhes (ex.: vagas 5 → 10, valor e E2E)
- [ ] `s17-30` Admin aprova psicólogo com o envio de e-mail falhando ⇒ aprovação vale e aparece como concluída (sem erro para o admin)
- [ ] `s17-25` Admin no computador ⇒ menu lateral fixo; cada seção com título e descrição no topo, sem título repetido

## 18. Segurança (ficha 20)


- [ ] `s18-01` Abrir o app dentro de um `<iframe>` de outro site ⇒ "o Soliv não abre dentro de outros sites"
- [ ] `s18-02` Paciente → Chat → enviar arquivo `.html` ou foto de 20 MB ⇒ recusado
- [ ] `s18-03` Ações repetidas em sequência (SOS, agendar, curtir) ⇒ "Muitas ações em pouco tempo"
- [ ] `s18-04` Supabase → SQL Editor → conferência rápida da ficha 20 ⇒ tudo `true`
- [ ] `s18-05` Psicólogo novo → cadastrar → sair e entrar de novo ⇒ continua em "cadastro em análise" (não entra no painel)
- [ ] `s18-06` Consulta → psicólogo entra na sala sozinho e encerra ⇒ a consulta não vira "realizada"; com o paciente na chamada, vira
- [ ] `s18-07` Psicólogo aprovado → pela API, trocar document_url ou sobrescrever/apagar o arquivo do documento ⇒ Nada muda; o admin continua vendo o documento aprovado
- [ ] `s18-08` Conta antiga (ou com consultas) → chamar cleanup-user ⇒ 403 "Para excluir sua conta, use Perfil > Excluir conta."

## 19. Rotinas automáticas (ficha 21)


- [ ] `s19-01` Supabase → SQL Editor → conferência da ficha 21 ⇒ todas as rotinas com execução recente sem erro
- [ ] `s19-02` Pedido de consulta sem resposta por 24 h ⇒ expira e a consulta do mês volta
- [ ] `s19-03` SOS concluído ⇒ ~24 h depois chega "Como você está hoje?"
- [ ] `s19-04` Admin → Visão geral → cartão "Rotinas automáticas" ⇒ "Todas as N rotinas estão ativas"; se alguma falhou nas últimas 24 h, aparece o nome e o erro
- [ ] `s19-05` Supabase → SQL → select count(*) from cron.job_run_details where end_time < now() - interval '15 days' ⇒ 0 depois da rotina purge-cron-history rodar

## 20. Sem internet (offline)

_Desligue o Wi-Fi e os dados, ou use o modo avião._


- [ ] `s01-18` Contas e acesso · Sair sem internet ⇒ sai mesmo assim em poucos segundos
- [ ] `s02-06` SOS · Na chamada → desligar Wi-Fi de um lado por 20 s ⇒ "Tentando reconectar" e volta sozinha
- [ ] `s02-31` SOS · SOS em andamento → paciente troca do Wi-Fi para o 4G ⇒ "Tentando reconectar" e volta sozinho
- [ ] `s02-36` SOS · Queda longa no meio do SOS (cronômetro pausado) ⇒ o servidor não corta a chamada enquanto ainda há tempo na tela
- [ ] `s02-57` SOS · Internet cai ao enviar uma mensagem ⇒ "Não enviada. Tentar de novo"; ao tentar, chega uma vez só
- [ ] `s03-41` Consultas agendadas · Consulta → conversar 2 min, a internet de um cai e ninguém volta ⇒ 30 min após o fim: "Consulta interrompida" para os dois; consulta do mês devolvida; fora do repasse
- [ ] `s03-54` Consultas agendadas · Agendar com a internet caindo no envio → tentar de novo ⇒ um pedido só, sem "limite do mês já usado"
- [ ] `s04-05` Chat · Psicólogo sem Wi-Fi → paciente manda 2 mensagens → religar ⇒ aparecem sem recarregar
- [ ] `s04-12` Chat · Paciente sem internet → mandar "um" e "dois" → religar ⇒ "Não enviada" enquanto offline; depois saem sozinhas, uma vez cada, na ordem
- [ ] `s04-13` Chat · Sem internet → mandar mensagem → recarregar a página ⇒ continua como "Não enviada" e sai quando a internet volta
- [ ] `s09-09` Meus hábitos · Água sem internet → tocar 2 copos → religar ⇒ "Sem internet agora", o anel avança; ao religar os 2 copos chegam uma vez cada
- [ ] `s09-10` Meus hábitos · Água sem internet → tocar copo → recarregar a página ⇒ o copo continua lá e é enviado quando a internet volta
- [ ] `s11-06` Questionários · PHQ-9 sem internet → enviar ⇒ "Tentar de novo"; respostas e apoio continuam na tela
- [ ] `s12-05` Plano de segurança · Abrir um plano → desligar a internet → abrir de novo ⇒ mostra o plano com "Sem internet"; "Ligar" funciona
- [ ] `s12-06` Plano de segurança · SOS sem internet e sem nunca ter aberto o plano ⇒ "Sem internet para abrir o seu plano agora" e CVV
- [ ] `s12-10` Plano de segurança · Sair da conta ⇒ o plano deixa de abrir sem internet naquele aparelho
- [ ] `s14-11` Grupos de apoio · Paciente A → salvar depoimento com a internet caindo e tentar de novo ⇒ aparece uma vez só

## 21. Notificações push

_Ficha 07 · push ativado no Perfil; teste com o app fechado e com a tela bloqueada._


- [ ] `s02-16` SOS · Psicólogo (app fechado, push ativo) → paciente pede SOS ⇒ push imediato
- [ ] `s03-16` Consultas agendadas · Um lado sozinho na sala → 2 min → Avisar ⇒ o outro recebe push
- [ ] `s03-23` Consultas agendadas · Lembretes: consulta marcada para daqui a 1 h ⇒ lembrete no app e push
- [ ] `s04-06` Chat · Psicólogo (app fechado) → paciente manda mensagem ⇒ push "Nova mensagem"
- [ ] `s04-17` Chat · App fechado → mensagem nova → tocar no push ⇒ abre a própria conversa
- [ ] `s05-01` Paciente → Perfil → Notificações push → ativar ⇒ navegador pede permissão
- [ ] `s05-02` App fechado → mensagem de outra conta ⇒ push em até 1 min; tocar abre o chat
- [ ] `s05-03` Paciente → Sair → nova mensagem ⇒ **não** chega push nesse aparelho
- [ ] `s05-05` Push de mensagem na tela bloqueada ⇒ "Você tem uma nova mensagem" (sem o nome de quem mandou)
- [ ] `s05-07` App aberto no navegador → tocar no push ⇒ abre na mesma aba (não abre outra)
- [ ] `s05-08` App Android/iPhone fechado → tocar no push de consulta ou mensagem ⇒ abre a tela do aviso
- [ ] `s05-12` Psicólogo com push ativo → paciente pede SOS → tocar no push ⇒ abre a fila do SOS
- [ ] `s06-20` Assinaturas · Cartão 4000 0000 0000 0341 → renovação recusada ⇒ aviso "Pagamento não aprovado" no sino e por push, uma vez por dia
- [ ] `s09-05` Meus hábitos · Remédio com horário daqui a 20 min (push ativo) ⇒ lembrete chega; marcar dose ⇒ não repete
- [ ] `s09-16` Meus hábitos · Lembrete do remédio na tela bloqueada ⇒ "Hora do remédio (08:00)", sem o nome do remédio
- [ ] `s09-17` Meus hábitos · Lembrete de "Parar de fumar" na tela bloqueada ⇒ "3 dias seguidos", sem dizer do quê
