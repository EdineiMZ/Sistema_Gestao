# Sistema de Gestão Inteligente

## Configuração de ambiente

As seguintes variáveis de ambiente são necessárias para executar o servidor:

- `SESSION_SECRET` (**obrigatória**): chave utilizada para assinar o cookie de sessão. Gere um valor longo e aleatório e mantenha-o fora do controle de versão. O servidor não inicializa caso esta variável não esteja definida.
- `NODE_ENV` (opcional): defina como `production` durante o deploy para que o cookie de sessão seja marcado como `Secure`.
- `NGROK_AUTHTOKEN` (**obrigatória** apenas para `npm run dev:tunnel`): token de autenticação da sua conta Ngrok. Defina somente quando precisar expor o ambiente de desenvolvimento para a internet.
- `NGROK_DOMAIN` (opcional): domínio reservado no Ngrok para reutilizar URLs estáveis durante o desenvolvimento.
- `NGROK_REGION` (opcional): região preferida para o túnel Ngrok, reduzindo latência ao escolher a localização mais próxima dos seus usuários.

Certifique-se de carregar estas variáveis antes de executar `npm start` ou `npm run dev`.

## Desenvolvimento com túnel Ngrok

Para compartilhar o ambiente de desenvolvimento com outros dispositivos ou serviços externos, utilize o script integrado ao projeto:

```bash
npm run dev:tunnel
```

O script valida as variáveis `SESSION_SECRET` e `NGROK_AUTHTOKEN`, inicia `npm run dev` e cria um túnel HTTPS através do Ngrok. Configure opcionalmente `NGROK_DOMAIN` e `NGROK_REGION` para personalizar o domínio exposto ou a região do túnel. Ao encerrar o comando (`Ctrl+C`), tanto o servidor local quanto o túnel são finalizados com segurança.

## Persistência de sessões

O projeto utiliza [`connect-session-sequelize`](https://www.npmjs.com/package/connect-session-sequelize) para armazenar sessões de forma persistente no banco de dados configurado pelo Sequelize. A tabela de sessões é criada automaticamente durante a inicialização.

Para instalar todas as dependências do projeto execute:

```bash
npm install
```

Em ambientes novos, garanta que o banco de dados esteja acessível antes de iniciar o servidor para evitar falhas na sincronização do store de sessões.
