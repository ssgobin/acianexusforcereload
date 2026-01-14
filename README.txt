Nexus Admin Panel
==================

Painel administrativo avançado para o ACIANexus / Nuvvo.

Arquivos:
- index.html  -> Interface principal do painel admin
- admin.css   -> Estilos do painel
- admin.js    -> Lógica, integração com Firebase e Firestore

Funcionalidades principais:
- Dashboard com KPIs:
  - Usuários cadastrados
  - Usuários online
  - Comunicados no mural
  - Último reload forçado
- Forçar reload global dos usuários através do doc admin/broadcast
- Logs de atualizações em admin/broadcastLogs/items
- Gestão de mural (criação e listagem de comunicados)
- Visualização de presença online (coleção "presence")
- Gestão de usuários e roles (coleção "users")
- Ferramentas de teste:
  - Envio de notificação de teste para inbox do usuário atual
  - Ping ao Firestore

Como usar:
1. Suba estes arquivos em uma pasta separada (ex: /admin) no mesmo domínio do Nexus.
2. Certifique-se de que o usuário ti@acia.com.br existe no Firebase Auth e possui role "admin" no doc users/{uid}.
3. Acesse /admin/index.html no navegador.
4. O login será feito automaticamente. Em caso de erro, veja o console.

Observação:
- Este painel é destinado apenas à equipe de TI/administradores. Não divulgue publicamente este código com as credenciais reais.
