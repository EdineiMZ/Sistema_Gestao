'use strict';

const sanitizeText = (value, { allowList = new Set(['.', ',', '-', '_', '(', ')', ':']) } = {}) => {
    if (value === undefined || value === null) {
        return '';
    }

    const normalized = String(value)
        .replace(/[\u0000-\u001F\u007F]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (!normalized) {
        return '';
    }

    const safeCharacters = /[A-Za-zÀ-ÖØ-öø-ÿ0-9\s]/;

    let sanitized = '';
    for (const char of normalized) {
        if (safeCharacters.test(char) || allowList.has(char)) {
            sanitized += char;
        }
    }

    return sanitized.trim();
};

const CHATBOT_TOPICS = Object.freeze([
    Object.freeze({
        id: 'login_access',
        title: 'Não consigo acessar minha conta',
        summary: 'Auxilia quando o usuário está enfrentando erros de autenticação ou esqueceu a senha.',
        steps: [
            'Confirme se o e-mail utilizado está cadastrado e ativo no sistema.',
            'Clique em “Esqueci minha senha” na tela de login e siga o processo de redefinição.',
            'Após redefinir a senha, limpe o cache do navegador ou tente em uma aba anônima.',
            'Caso utilize autenticação em duas etapas, verifique se o código foi digitado dentro de 60 segundos.'
        ],
        expectedResult: 'O usuário volta a acessar o sistema normalmente após redefinir a senha ou corrigir o método de login.',
        escalationMessage: 'Persistindo o problema, o acesso pode estar bloqueado por segurança. Um atendente poderá verificar os logs e reativar a conta com segurança.',
        tags: ['autenticação', 'senha', 'segurança']
    }),
    Object.freeze({
        id: 'billing_payment',
        title: 'Pagamento não aprovado ou fatura em aberto',
        summary: 'Recomenda ações para normalizar pagamentos pendentes e atualizar boletos.',
        steps: [
            'Acesse a área Financeiro → Faturas e confirme o status do último pagamento.',
            'Clique em “Gerar segunda via” para emitir um novo boleto ou atualizar o link de pagamento.',
            'Verifique com o banco ou cartão se há bloqueios de segurança e libere a transação.',
            'Após o pagamento, aguarde até 10 minutos e atualize a página para sincronizar o status.'
        ],
        expectedResult: 'A fatura deve aparecer como quitada após a confirmação pelo gateway financeiro.',
        escalationMessage: 'Caso o pagamento não seja reconhecido, um agente pode validar o comprovante e liberar o acesso manualmente.',
        tags: ['financeiro', 'cobrança', 'pagamentos']
    }),
    Object.freeze({
        id: 'reports_performance',
        title: 'Relatórios demorando para carregar',
        summary: 'Sugere boas práticas para otimizar a geração de relatórios pesados.',
        steps: [
            'Filtre o período para intervalos menores (ex.: últimos 30 dias) antes de exportar.',
            'Utilize os filtros avançados para limitar a quantidade de registros exibidos.',
            'Evite executar múltiplas exportações simultâneas na mesma conta.',
            'Prefira o formato CSV quando precisar de grandes volumes de dados.'
        ],
        expectedResult: 'Os relatórios devem carregar mais rápido após aplicar filtros mais específicos.',
        escalationMessage: 'Se o desempenho continuar ruim, um especialista pode avaliar o volume de dados e sugerir otimizações no workspace.',
        tags: ['relatórios', 'desempenho', 'analytics']
    }),
    Object.freeze({
        id: 'integration_webhook',
        title: 'Integração via webhook não dispara eventos',
        summary: 'Checklist básico para validar configurações de integrações externas.',
        steps: [
            'Confirme a URL do webhook na área Configurações → Integrações.',
            'Envie um teste manual usando o botão “Disparar evento de teste”.',
            'Verifique se o endpoint responde com status HTTP 200 em até 5 segundos.',
            'Consulte os logs em Configurações → Integrações → Logs para identificar falhas recentes.'
        ],
        expectedResult: 'Os eventos voltam a ser entregues ao serviço externo após ajustar a URL ou tempo de resposta.',
        escalationMessage: 'Caso continue falhando, compartilhe o ID do log mais recente para que um agente analise a fila de eventos.',
        tags: ['integração', 'webhook', 'api']
    })
]);

const cloneTopic = (topic) => {
    if (!topic) {
        return null;
    }

    return {
        id: topic.id,
        title: topic.title,
        summary: topic.summary,
        steps: Array.isArray(topic.steps) ? [...topic.steps] : [],
        expectedResult: topic.expectedResult || null,
        escalationMessage: topic.escalationMessage || null,
        tags: Array.isArray(topic.tags) ? [...topic.tags] : []
    };
};

const listTopics = () => CHATBOT_TOPICS.map(cloneTopic);

const getTopicById = (topicId) => {
    if (!topicId) {
        return null;
    }

    const normalizedId = sanitizeText(topicId, { allowList: new Set(['-', '_']) }).toLowerCase();
    if (!normalizedId) {
        return null;
    }

    const topic = CHATBOT_TOPICS.find((entry) => entry.id === normalizedId);
    return cloneTopic(topic);
};

const buildSolutionPayload = (topic) => {
    const safeTopic = cloneTopic(topic);
    if (!safeTopic) {
        return null;
    }

    return {
        id: safeTopic.id,
        title: safeTopic.title,
        summary: safeTopic.summary,
        steps: safeTopic.steps,
        expectedResult: safeTopic.expectedResult,
        escalationMessage: safeTopic.escalationMessage,
        tags: safeTopic.tags
    };
};

const normalizeDetails = (details) => {
    if (!details) {
        return '';
    }

    const sanitized = sanitizeText(details, { allowList: new Set(['.', ',', '-', '_', '(', ')', '/', ':']) });
    if (!sanitized) {
        return '';
    }

    return sanitized.slice(0, 600);
};

module.exports = {
    listTopics,
    getTopicById,
    buildSolutionPayload,
    normalizeDetails
};
