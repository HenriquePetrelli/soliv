# Roadmap

- [x] Clarear o laranja exclusivo do SOS e ajustar seus estados hover/active com contraste adequado.
- [x] Padronizar os estados hover/active dos botões compartilhados do aplicativo.
- [x] Equalizar os itens do BottomNavigation, sem fundos de hover/foco, com ícone roxo no ativo/foco e escuro no hover.
- [x] Substituir o cinza do BottomNavigation e DesktopSidebar por superfícies neutras alinhadas ao tema.
- [x] Atualizar a documentação visual e a visão geral do produto.
- [x] Validar cores, testes relevantes e aparência disponível sem sessão autenticada.

## Pendências

- [ ] Melhorar o SEO e a visibilidade do app (meta tags, Open Graph, sitemap, robots.txt, dados estruturados e presença nas lojas de apps).
  - [x] Parte técnica (2026-11-22): endereço oficial (canonical) em `solivsaude.com.br` em todas as páginas, inclusive nas cópias da Lovable; título e descrição por página pública e `noindex` nas telas com login (`src/lib/seo.ts`, `src/components/RouteSeo.tsx`); Open Graph completo com imagem em endereço absoluto (WhatsApp/Facebook); dados estruturados (Organization, WebSite, WebApplication); `public/robots.txt` com as áreas logadas bloqueadas e o sitemap; `public/sitemap.xml` com as 7 páginas públicas. Teste: `src/test/seo.test.ts`.
  - [ ] Google Search Console: adicionar `solivsaude.com.br` como propriedade de domínio (registro TXT no DNS do Registro.br) e enviar `https://solivsaude.com.br/sitemap.xml`. Fazer o mesmo no Bing Webmaster Tools (dá para importar do Search Console).
  - [ ] Conferir a prévia do link no WhatsApp e no [Sharing Debugger do Facebook](https://developers.facebook.com/tools/debug/) depois de publicar.
  - [ ] Decidir se haverá uma página de apresentação: hoje a página inicial é o login, com pouco texto para o Google entender o que é o Soliv e para quem.
  - [ ] Página nas lojas (nome, descrição curta e longa, palavras-chave, capturas de tela) quando os apps forem publicados (pendência 25).
