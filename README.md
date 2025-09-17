# Sistema de Gestão Inteligente

## Configuração de ambiente

As seguintes variáveis de ambiente são necessárias para executar o servidor:

- `SESSION_SECRET` (**obrigatória**): chave utilizada para assinar o cookie de sessão. Gere um valor longo e aleatório e mantenha-o fora do controle de versão. O servidor não inicializa caso esta variável não esteja definida.
- `NODE_ENV` (opcional): defina como `production` durante o deploy para que o cookie de sessão seja marcado como `Secure`.

Certifique-se de carregar estas variáveis antes de executar `npm start` ou `npm run dev`.

## Persistência de sessões

O projeto utiliza [`connect-session-sequelize`](https://www.npmjs.com/package/connect-session-sequelize) para armazenar sessões de forma persistente no banco de dados configurado pelo Sequelize. A tabela de sessões é criada automaticamente durante a inicialização.

Para instalar todas as dependências do projeto execute:

```bash
npm install
```

Em ambientes novos, garanta que o banco de dados esteja acessível antes de iniciar o servidor para evitar falhas na sincronização do store de sessões.
