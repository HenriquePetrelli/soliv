# 16. Grupos de apoio

> **Status:** Pronto.
> **Última verificação:** 2026-10-15 (varredura de funcionamento: plano conferido no servidor, reação numa operação só, sem reagir ao próprio depoimento, depoimento sem duplicar, em análise após 3 denúncias, apoio de crise ao escrever).
> **Quem usa:** paciente (lê, escreve, curte, denuncia) e admin (modera).

## Resumo

Grupos por tema (ex.: ansiedade, depressão) onde pacientes deixam depoimentos, que podem ser **anônimos** e ligados a um sintoma do grupo. Outros pacientes curtem ("me ajudou" e "não me ajudou") e podem denunciar. A moderação é feita pelo admin; nada é apagado automaticamente. Um depoimento com 3 denúncias pendentes, de pessoas diferentes, sai da lista dos outros até o admin revisar (o autor continua vendo, com o aviso "em análise").

## Telas

| Rota | Tela |
|---|---|
| `/support-groups` | Lista de grupos, com favoritos |
| `/support-group/:groupId` | Depoimentos do grupo, escrever, curtir, denunciar |
| `/admin-dashboard` → Grupos | Moderação (ficha 19) |

## Como funciona

1. O paciente abre um grupo e lê os depoimentos (`get_group_testimonials`). Depoimento anônimo não traz nome nem identificação do autor na resposta.
2. **Escrever** (planos Essencial, Flex e Completo, inclusive o pago pela empresa; conferido no servidor): texto (até 500 caracteres na tela; 3.000 no banco), humor e, se quiser, um sintoma da lista do grupo, marcando ou não "Anônimo". O limite é 5 depoimentos por hora. Cada depoimento tem um id criado no aparelho: salvar de novo depois de uma resposta perdida não publica em dobro.
   - Se o texto fala em se machucar ou em morrer, aparece na hora um quadro com "Ligar 188" (CVV) e "Abrir o SOS". Não impede de publicar.
3. **Reagir** (Essencial, Flex e Completo): "me ajudou" ou "não me ajudou", uma por depoimento, com limite de 60 por minuto. Pôr, trocar e tirar são uma operação só no servidor (`react_to_testimonial`), feitas na ordem dos toques; a tela mostra na hora e depois usa os totais do servidor. Sem aviso de sucesso a cada toque. Ninguém reage ao próprio depoimento (também conferido no servidor). Cada pessoa vê só as próprias reações; dos outros, só os totais.
4. **Denunciar** (`report_group_testimonial`): motivo e detalhes. Vai para a moderação. Com 3 denúncias pendentes de pessoas diferentes, o depoimento fica **em análise**: sai da lista dos outros e o autor vê o aviso. Se o admin descartar as denúncias, volta a aparecer; se excluir, some.
5. **Admin**: lista todos com curtidas e denúncias, destaca os que chegaram a 10 "não me ajudou" e pode editar ou excluir.
6. **Favoritar** um grupo deixa ele no topo da lista.

## Onde está no código

- **Telas e componentes**: `src/pages/SupportGroups.tsx`, `SupportGroupDetail.tsx`, `src/components/support-groups/`.
- **Hooks**: `useSupportGroups`, `useGroupTestimonialModeration` (admin).
- **Banco**: `support_groups`, `group_testimonials`, `group_testimonial_likes`, `group_favorites`, `transtornos_sintomas`. Funções: `get_group_testimonials` (com `under_review`), `react_to_testimonial`, `testimonial_like_totals`, `current_user_has_paid_plan`, `report_group_testimonial`, `get_admin_group_testimonials`, `admin_update_testimonial`, `admin_delete_testimonial`, `admin_dismiss_testimonial_reports`.

## Como validar

### Teste manual
1. Paciente A escreve um depoimento **anônimo** → paciente B vê "Anônimo", sem nome.
2. Paciente B curte "me ajudou" → o contador sobe; curtir de novo não duplica. Trocar para "não me ajudou" → um contador desce e o outro sobe (e continua assim ao recarregar).
3. Paciente B denuncia → o admin vê a denúncia na aba Grupos.
4. O admin edita o texto → todos veem o texto novo. O admin exclui → some.
5. Paciente A escreve 6 depoimentos seguidos → o 6º é recusado ("Muitas ações em pouco tempo").
6. Paciente B toca "me ajudou" várias vezes bem rápido → nenhum erro, nenhum aviso a cada toque; ao recarregar, o contador bate com o botão.
7. Paciente sem plano Essencial/Flex/Completo → não consegue escrever nem reagir (nem pela API: "Escrever depoimentos e reagir é dos planos Essencial, Flex e Completo.").
8. Paciente A escreve "às vezes penso em me matar" → aparece o quadro com "Ligar 188" e "Abrir o SOS"; dá para publicar mesmo assim.
9. Três pacientes diferentes denunciam o mesmo depoimento → some para os outros; o autor vê "Em análise". O admin descarta as denúncias → volta a aparecer.

### Testes automáticos
`useGroupTestimonials`, `useGroupTestimonialModeration`, `supportGroupRules` (reação pela função, ordem dos toques, sem avisos de sucesso, depoimento sem duplicar, em análise, apoio de crise).

### Conferência no banco
```sql
select id, group_id, anonimo, likes_positivos, likes_negativos, criado_em
from group_testimonials order by criado_em desc limit 20;
```

## Regras de privacidade

- Curtidas: cada pessoa lê só as próprias (o admin lê todas). Os totais vêm por `get_group_testimonials`.
- Contadores de curtidas só mudam pelo gatilho de contagem (`update_testimonial_like_counts`; o gatilho repetido `update_testimonial_like_counts_trigger` foi removido em 2026-10-15) e o autor não os altera (`a_guard_testimonial_client_write`).
- Plano pago conferido no banco (`a_guard_group_paid_write`) ao escrever e ao reagir; reagir ao próprio depoimento é recusado (`b_guard_testimonial_like_author`).

## Pendências

- Nenhuma de produto: 3 denúncias pendentes de pessoas diferentes tiram o depoimento da lista até a revisão (confirmado em 2026-10-28).

Varredura de funcionamento em 2026-10-15: migration `20261010013733_b8944b57-23f5-4d9b-ac96-bff32ef1962d.sql`. As duas pendências de privacidade foram corrigidas em 2026-10-04 (migration `20261003232116_d6f3adac-0952-4317-8e77-a3a5ec8ff312.sql`), junto com a troca de reação, que falhava em silêncio.

## Problemas comuns

| Sintoma | Causa provável | O que olhar |
|---|---|---|
| Nome do grupo aparece genérico | Tela aberta direto (corrigido: busca no banco) | Versão publicada |
| Depoimento sumiu | Excluído pelo admin | `admin_audit_log` |
| "Muitas ações em pouco tempo" | Mais de 5 depoimentos por hora | Esperado |
| Depoimento sumiu para os outros, mas o autor vê "Em análise" | 3+ denúncias pendentes | Admin → Moderação → Grupos de apoio |
| "Escrever depoimentos e reagir é dos planos Essencial, Flex e Completo." | Sem plano pago ou plano vencido | `subscribers` da pessoa |
