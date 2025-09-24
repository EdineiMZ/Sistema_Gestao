# Sistema de Gestão Inteligente

## Configuração de ambiente

As seguintes variáveis de ambiente são necessárias para executar o servidor:

- `SESSION_SECRET` (**obrigatória**): chave utilizada para assinar o cookie de sessão. Gere um valor longo e aleatório e mantenha-o fora do controle de versão. O servidor não inicializa caso esta variável não esteja definida.
- `NODE_ENV` (opcional): defina como `production` durante o deploy para que o cookie de sessão seja marcado como `Secure`.
- `NGROK_AUTHTOKEN` (**obrigatória** apenas para `npm run dev:tunnel`): token de autenticação da sua conta Ngrok. Defina somente quando precisar expor o ambiente de desenvolvimento para a internet.
- `NGROK_DOMAIN` (opcional): domínio reservado no Ngrok para reutilizar URLs estáveis durante o desenvolvimento.
- `NGROK_REGION` (opcional): região preferida para o túnel Ngrok, reduzindo latência ao escolher a localização mais próxima dos seus usuários.
- `PAYMENT_TOKEN_SECRET` (**obrigatória** para armazenar tokens de pagamento no painel): chave simétrica utilizada para criptografar credenciais sensíveis com AES-256-GCM. Utilize um valor aleatório com, no mínimo, 32 caracteres.

Tokens de provedores como Mercado Pago ou Google Pay podem ser definidos diretamente no `.env` seguindo o padrão `CNPJ_API_NOME_DO_BANCO=TOKEN`. Exemplo: `12345678000199_MERCADO_PAGO_ITAU=seu_token_aqui`. Valores definidos no ambiente têm prioridade sobre os tokens cadastrados via painel administrativo.

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

## Limpeza automática de lançamentos financeiros

Durante a inicialização o servidor executa uma rotina de saneamento que associa lançamentos em `FinanceEntries` sem `userId` a um usuário de fallback. A rotina prioriza contas com função de administrador; se nenhuma existir, utiliza o usuário mais antigo disponível. Caso nenhum usuário esteja cadastrado, o processo de boot é interrompido com uma mensagem orientando a criação de uma conta para prosseguir.
