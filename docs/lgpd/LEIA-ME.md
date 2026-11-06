# Documentos jurídicos do Soliv — o que falta para publicar

Esta pasta tem a **versão para revisão** de:

- `politica-de-privacidade.md` — para pacientes e psicólogos;
- `termos-de-uso-paciente.md`;
- `termos-de-uso-psicologo.md`;
- `registro-de-tratamento.md` — documento **interno**, exigido pela LGPD (art. 37), com o inventário real dos dados. Não é publicado.

Os textos foram escritos a partir do que o app **de fato** faz, com as decisões tomadas em 28/09/2026: empresa **LTDA** como controladora, **só maiores de 18**, **guarda de 5 anos** dos registros de atendimento e **falhas técnicas avaliadas caso a caso** pelo suporte.

## 1. Dados a preencher (campos `[...]`)

| Campo | Onde aparece |
|---|---|
| Razão social, CNPJ e endereço da LTDA | todos os documentos |
| Nome e e-mail do encarregado de dados (DPO) | política e termos |
| E-mail de suporte | termos |
| Data de publicação | todos |
| Hospedagem do site | política, item 6 |
| Cidade da sede (foro dos psicólogos) | termos do psicólogo |

O encarregado pode ser um dos sócios. O importante é que o e-mail seja lido e respondido em até 15 dias.

## 2. Perguntas para o advogado (marcadas com ⚖️ nos textos)

1. **Bases legais para dados de saúde:** o consentimento destacado (art. 11, I) para as funções do app e a tutela da saúde (art. 11, II, "f") para os atendimentos estão bem aplicados?
2. **Guarda de 5 anos após a exclusão da conta:** a Resolução CFP 01/2009 sustenta manter os registros de atendimento mesmo quando o paciente pede a exclusão?
3. **Natureza da relação com os psicólogos:** o texto afasta bem o vínculo empregatício? Qual o tratamento fiscal dos repasses (nota fiscal, RPA, retenções)?
4. **Responsabilidade da plataforma** pelo atendimento feito pelo psicólogo, e o limite de responsabilidade por falhas técnicas diante do Código de Defesa do Consumidor.
5. **SOS sem garantia de tempo:** a redação protege a empresa sem ser abusiva para o consumidor?
6. **Cancelamento da assinatura:** o plano continua até o fim do período já pago e não renova; só o cancelamento em até 7 dias (arrependimento) encerra o acesso na hora, com reembolso integral. A redação dos termos (item 5) está adequada?
7. **Transferência internacional:** quais garantias citar para Supabase, Stripe, Resend, Google e Twilio?
8. **Guarda do chat:** as mensagens entre paciente e psicólogo são apagadas após 3 meses. Elas fazem parte do registro do atendimento e deveriam seguir o prazo de 5 anos?
9. **e-Psi e Resolução CFP 11/2018:** exigências de cadastro para atendimento on-line.
10. **Registros de acesso (Marco Civil, art. 15):** o provedor de aplicação deve guardar por 6 meses. Os logs do Supabase no plano atual cobrem esse prazo?
11. **Arrependimento depois de usar o serviço:** hoje o reembolso de 7 dias é integral e automático, mesmo que a pessoa já tenha feito o SOS ou a consulta do mês (que geram repasse ao psicólogo). É possível descontar o que já foi usado?
12. **Prova do aceite após a exclusão da conta:** o histórico de aceites (data e versão) é apagado junto com a conta. Convém guardá-lo pelo mesmo prazo dos registros de atendimento?
13. **B2B (empresas):** o contrato com a empresa precisa de cláusulas próprias (a empresa como cliente, sem acesso a dados individuais; LGPD na relação empresa–Soliv–colaborador; desligamento do colaborador). O RH vê só totais com 5 ou mais pessoas: isso basta como anonimização?
14. **SOS on-line e urgência/emergência:** a Resolução CFP 11/2018 tratava o atendimento de pessoas em urgência e emergência por meios on-line como inadequado. Qual norma vale hoje (Resolução CFP 09/2024?) e o que ela permite para o SOS por vídeo e por mensagem, incluindo a triagem de risco de suicídio? As citações dos termos devem ser atualizadas?

## 3. Regras que o app já cumpre

Estas mudanças foram feitas em 28/09/2026 para o app cumprir o que os documentos descrevem:

- [x] **Guarda de 5 anos na exclusão de conta.** Antes de apagar a conta, "Excluir minha conta" copia os pedidos de SOS, as consultas e as avaliações (com as anotações clínicas) para um arquivo separado, sem ligação com o login. O psicólogo que atendeu continua podendo consultar esses registros. Se a cópia falhar, nada é apagado.
- [x] **Eliminação automática ao fim dos 5 anos.** Uma rotina diária (00:30, horário de Brasília) apaga os registros de atendimento com mais de 5 anos, tanto do arquivo quanto das contas ativas.
- [x] **Aceite no cadastro.** O cadastro de pacientes e de psicólogos só é concluído com as caixas "Tenho 18 anos ou mais" e "Li e aceito os Termos de Uso e a Política de Privacidade". O paciente também dá o **consentimento destacado** para dados de saúde. A data, a versão de cada documento e o navegador ficam gravados no banco (tabela `legal_acceptances`).
- [x] **Telas de Termos e Política no app** em `/termos`, `/termos-psicologo` e `/privacidade`, abertas mesmo sem login, com links no cadastro e no perfil. Os textos vêm direto desta pasta. As marcações ⚖️ e o aviso de revisão do topo não aparecem no app. **Enquanto houver campos `[...]` sem preencher, a tela mostra o aviso "Versão em revisão jurídica".**
- [x] **Novo aceite quando os textos mudarem.** A versão de cada documento é a do campo **Versão** no topo do arquivo. Ao publicar um texto novo, mude esse número (por exemplo, de 1.0 para 1.1): no próximo acesso, o app pede o aceite de novo, e quem não aceitar só pode sair da conta. Correções pequenas, que não mudam direitos, podem manter a versão.
- [x] **Reembolso em 7 dias.** Ao cancelar pelo app em até 7 dias da primeira assinatura, o app avisa que haverá devolução e faz o reembolso na Stripe na hora. Se o reembolso falhar, a assinatura é cancelada do mesmo jeito e o caso fica registrado no log de segurança (`withdrawal_refund_failed`) para o suporte concluir.

### Antes de publicar

1. Preencher os campos `[...]` e revisar com o advogado (itens 1 e 2).
2. Manter a versão **1.0** na primeira publicação e trocar `[DATA DE PUBLICAÇÃO]` pela data real.
3. ~~Aplicar a migration e publicar as funções `delete-own-account` e `cancel-subscription`~~ (feito em 29/09/2026).
