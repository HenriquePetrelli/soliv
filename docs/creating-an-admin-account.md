# Como criar uma conta de administrador

Não existe (nem deve existir) um formulário no app para isso — criar um admin dá acesso total à plataforma (ver/editar/excluir todo paciente e psicólogo, dados de pagamento, moderação), então é sempre um passo manual, feito por quem tem acesso ao painel do Supabase.

## Passo 1 — Criar o usuário no Supabase

No painel do Supabase do projeto: **Authentication → Users → Add user** (ou "Invite user", se preferir que a pessoa defina a própria senha por e-mail).

Preencha email e senha (ou envie o convite) e clique em criar. Copie o **UUID** do usuário criado — vai aparecer na lista de usuários assim que ele existir.

## Passo 2 — Dar a ele acesso de admin

No painel do Supabase: **SQL Editor**, cole o script abaixo substituindo `<UUID_DO_USUARIO>` e `<NOME_COMPLETO>` pelos valores reais, e rode:

```sql
-- 1) Perfil da conta
insert into public.profiles (user_id, user_type, full_name)
values ('<UUID_DO_USUARIO>', 'admin', '<NOME_COMPLETO>');

-- 2) Concede o acesso de administrador
insert into public.admin_users (user_id, granted_by, is_active)
values ('<UUID_DO_USUARIO>', '<UUID_DO_USUARIO>', true);
```

(`granted_by` guarda quem concedeu o acesso — como normalmente é o primeiro/único admin se concedendo, self-referencia é aceitável; se você já tem outro admin ativo, pode usar o UUID dele ali em vez do próprio.)

Pronto — a pessoa já consegue entrar pela tela de login normal do app (não existe uma tela de login separada para admin) com o email e senha cadastrados; o app reconhece pelo `user_type = 'admin'` do perfil e leva direto para `/admin-dashboard`.

## Removendo o acesso de um admin

Sem excluir a conta (só tira o acesso administrativo, a pessoa vira um usuário comum):

```sql
update public.admin_users set is_active = false where user_id = '<UUID_DO_USUARIO>';
```

## Por que não existe um botão pra isso no app

Existiu — uma edge function (`create-admin-account`) e uma tela (`AdminCreateForm`) que criavam admin direto pelo app. Foram removidas porque a edge function não verificava absolutamente nada: qualquer requisição HTTP, de qualquer pessoa (mesmo sem estar logada, usando só a chave pública `anon`), conseguia criar uma conta de admin completa. A tela nunca chegou a ser ligada a nenhuma rota do app, então o buraco não aparecia navegando — mas a função continuava publicada e chamável direto pela URL, então o risco era real. Passar esse fluxo para o painel do Supabase elimina esse risco por completo: não existe mais nenhum endpoint no app capaz de conceder acesso de admin.

> **Atenção (2026-11-08):** a função saiu do repositório, mas a cópia publicada no Supabase não tinha sido apagada. Ver pendência 20 em `docs/pendencias-antes-do-lancamento.md`.
