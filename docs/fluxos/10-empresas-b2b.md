# 10. Empresas (B2B)

> **Status:** Pronto.
> **Última verificação:** 2026-10-22 (varredura de funcionamento: domínio de e-mail comprovado pela confirmação do e-mail; código usado no cadastro vale ao confirmar). Antes: 2026-10-06 (varredura: desligado pela empresa não volta sozinho com o código; domínio de e-mail não comprovado, ver Pendências). Antes: 2026-10-02 (comparado com Calm Business, Headspace for Work e Zenklub; 36 checagens SQL). Em 2026-10-04 ganhou limite contra tentativa e erro de códigos.
> **Quem usa:** admin (cadastra), gestor do RH (portal) e colaborador (usa o benefício).

## Resumo

A empresa contrata vagas de um plano (Essencial, Flex ou Completo). O colaborador entra com o **código de convite** e recebe o plano sem pagar. O RH acompanha vagas e uso agregado, sem ver quem usa o quê. A cobrança da empresa é feita fora do app (proposta e nota fiscal).

## Telas

| Rota | Quem | Tela |
|---|---|---|
| `/admin-dashboard` → Empresas | Admin | Cadastro: plano, vagas, vigência, status, domínio de e-mail, código, valor por vaga, dia de cobrança, gestores |
| `/empresa` | Gestor do RH | Portal: vagas, contrato, código e mensagem de convite, novo código, desligamento, uso agregado |
| `/beneficio-empresa` | Colaborador | Benefício da empresa (só aparece no Perfil para quem tem vínculo) |
| Cadastro e `/subscription-plans` | Colaborador | Campo "Código da empresa" |

## Como funciona

1. **Admin cadastra** a empresa e define gestores. O código de convite é gerado (8 caracteres).
2. **Colaborador usa o código** no cadastro ou em Planos → "Usar o código da empresa" (`join_organization`). O app confere:
   - se o código existe e o contrato está ativo e vigente;
   - se o e-mail é do domínio permitido (quando configurado) **e está confirmado** (`email_not_confirmed`); quem usou o código no cadastro entra na empresa sozinho assim que confirma o e-mail (gatilho `on_auth_user_email_confirmed_organization`), e até lá não ocupa vaga;
   - se há vaga;
   - se a pessoa não tem benefício de outra empresa.
3. **Acesso**: um gatilho em `subscribers` aplica o plano da empresa, valendo o maior entre Stripe e empresa. SOS, consultas e cotas funcionam como num plano pago.
4. **Quem já pagava** uma assinatura própria é avisado, com atalho para cancelar a própria.
5. **Desligamento pelo RH**: o gestor informa o e-mail de quem saiu (`remove_organization_member_by_email`). A pessoa mantém o plano até o fim do mês e a vaga fica livre na hora. A resposta é a mesma exista ou não alguém com o e-mail, para o RH não descobrir quem usa o app.
6. **Contrato pausado, encerrado ou vencido**: a rotina diária `expire-organization-entitlements` tira o acesso.
7. **Uso no portal**: só totais da empresa, e só quando há 5 ou mais colaboradores (privacidade).

## Regras

- Gestor do RH também pode usar o benefício (vínculos separados).
- Código: 20 tentativas a cada 15 minutos por pessoa (ou por IP, antes do cadastro).
- O RH nunca vê nomes, uso individual, conversas ou atendimentos.
- Remoção pelo admin é imediata; pelo RH, vale até o fim do mês.
- Quem foi desligado pelo RH ou pelo admin **não volta sozinho** com o mesmo código (`removed_by_company`); quem saiu por conta própria pode voltar. Quem desligou fica em `organization_members.removed_by`.

## Onde está no código

- **Telas e hooks**: `src/pages/CompanyPortal.tsx`, `CompanyBenefit.tsx`, `useCompanyBenefit`, `src/lib/organizations.ts` (mensagens de erro).
- **Banco**: `organizations`, `organization_members`, `subscribers`. Funções: `check_organization_code`, `join_organization`, `join_organization_for_user`, `leave_organization`, `organization_entitlement`, `get_organization_dashboard`, `rotate_organization_invite_code`, `remove_organization_member_by_email`, `is_organization_manager`. Gatilho `apply_organization_entitlement`.
- **Teste SQL**: `supabase/tests/b2b_organizations.sql`.

## Como validar

### Teste manual
1. Admin cria a empresa "Teste" (Completo, 2 vagas, domínio `empresa.com`).
2. Cadastrar paciente `ana@empresa.com` com o código → entra Completo (Perfil → Benefício da empresa).
3. Paciente `joao@gmail.com` com o código → recusa ("vale só para e-mails @empresa.com").
4. Ocupar as 2 vagas e tentar a 3ª → "As vagas acabaram".
5. Portal do RH → desligar `ana@empresa.com` → a vaga volta; Ana mantém o plano até o fim do mês.
6. Admin pausa o contrato → no dia seguinte (ou rodando a rotina), os colaboradores perdem o plano.
7. Digitar 21 códigos errados → "Muitas tentativas de código".

### Testes automáticos
`companyBenefit`, `profileCompanyEntry`; teste SQL `supabase/tests/b2b_organizations.sql` (só em Postgres local).

### Conferência no banco
```sql
select name, plan_tier, seats, status, starts_on, ends_on, invite_code from organizations;

select o.name, m.role, m.status, m.access_until
from organization_members m join organizations o on o.id = m.organization_id
where m.user_id = '<id>';

select subscription_tier, entitlement_source, organization_id from subscribers where user_id = '<id>';
```

## Pendências

- **Domínio de e-mail**: desde 2026-10-22 o banco exige e-mail confirmado para empresas com domínio. Isso só passa a valer de fato quando "Confirmar e-mail" for ligado no Supabase (com a confirmação desligada, o e-mail já nasce confirmado), o que depende de SMTP/domínio próprio (ficha 01). Até lá, a mitigação continua: vagas limitadas, o RH vê quantas estão ocupadas, desliga e gera novo código.
- Cobrança da empresa é processo comercial fora do app.

## Problemas comuns

| Sintoma | Causa provável | O que olhar |
|---|---|---|
| "Código não encontrado" | Digitação ou código trocado ("Novo código" no portal) | `organizations.invite_code` |
| Entrou, mas o plano não mudou | Contrato inativo ou fora da vigência | `status`, `starts_on`, `ends_on` |
| Aba "Uso" vazia no portal | Menos de 5 colaboradores | Esperado (privacidade) |
| Perdeu o plano antes do fim do mês | Removido pelo admin (imediato) | `organization_members.removed_at`, `access_until` |
