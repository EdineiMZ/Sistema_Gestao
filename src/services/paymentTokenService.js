const crypto = require('node:crypto');
const models = require('../../database/models');
const logger = require('../utils/logger');

const { PaymentGatewayToken, Company } = models;

const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const ENCRYPTION_KEY_LENGTH = 32;
const ENCRYPTION_IV_LENGTH = 12;
const PBKDF2_ITERATIONS = 120000;
const TOKEN_SECRET_ENV = 'PAYMENT_TOKEN_SECRET';

const normalizeCnpj = (value) => {
    if (!value) {
        return null;
    }

    const digits = String(value).replace(/\D+/g, '');
    return digits.length === 14 ? digits : null;
};

const normalizeKeySegment = (value) => {
    if (value === undefined || value === null) {
        return null;
    }

    const raw = String(value).trim();
    if (!raw) {
        return null;
    }

    const normalized = raw
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .toUpperCase();

    return normalized || null;
};

const isSecretConfigured = () => {
    const secret = process.env[TOKEN_SECRET_ENV];
    return typeof secret === 'string' && secret.trim().length >= 32;
};

const requireSecret = () => {
    if (!isSecretConfigured()) {
        const error = new Error('PAYMENT_TOKEN_SECRET não configurado ou muito curto.');
        error.code = 'TOKEN_SECRET_MISSING';
        throw error;
    }

    return process.env[TOKEN_SECRET_ENV].trim();
};

const deriveEncryptionKey = (companyCnpj) => {
    const baseSecret = requireSecret();
    const salt = crypto.createHash('sha256')
        .update(`payment-gateway-token::${companyCnpj}`)
        .digest();

    return crypto.pbkdf2Sync(baseSecret, salt, PBKDF2_ITERATIONS, ENCRYPTION_KEY_LENGTH, 'sha512');
};

const encryptToken = (token, companyCnpj) => {
    if (typeof token !== 'string' || !token.trim()) {
        throw new Error('Token da API não pode ser vazio.');
    }

    const normalizedToken = token.trim();
    const iv = crypto.randomBytes(ENCRYPTION_IV_LENGTH);
    const key = deriveEncryptionKey(companyCnpj);
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);

    const encrypted = Buffer.concat([cipher.update(normalizedToken, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return {
        encryptedToken: encrypted.toString('base64'),
        encryptionIv: iv.toString('base64'),
        encryptionAuthTag: authTag.toString('base64')
    };
};

const decryptToken = (record, companyCnpj) => {
    const key = deriveEncryptionKey(companyCnpj);
    const iv = Buffer.from(record.encryptionIv, 'base64');
    const authTag = Buffer.from(record.encryptionAuthTag, 'base64');
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
        decipher.update(Buffer.from(record.encryptedToken, 'base64')),
        decipher.final()
    ]);

    return decrypted.toString('utf8');
};

const buildIntegrationKey = ({ cnpj, apiName, bankName }) => {
    const normalizedCnpj = normalizeCnpj(cnpj);
    const normalizedApi = normalizeKeySegment(apiName);
    const normalizedBank = normalizeKeySegment(bankName);

    if (!normalizedCnpj) {
        throw new Error('CNPJ inválido para gerar chave de integração.');
    }

    if (!normalizedApi) {
        throw new Error('Nome da API inválido para gerar chave de integração.');
    }

    if (!normalizedBank) {
        throw new Error('Nome do banco inválido para gerar chave de integração.');
    }

    return `${normalizedCnpj}_${normalizedApi}_${normalizedBank}`;
};

const hashToken = (token) => {
    return crypto.createHash('sha256').update(token).digest('hex');
};

const buildPreview = (token) => {
    const trimmed = token.trim();
    const lastFour = trimmed.slice(-4);
    return `••••${lastFour}`;
};

const findCompanyOrFail = async (companyId) => {
    const company = await Company.findByPk(companyId, { attributes: ['id', 'cnpj'] });
    if (!company) {
        const error = new Error('Empresa não encontrada.');
        error.status = 404;
        throw error;
    }

    const normalizedCnpj = normalizeCnpj(company.cnpj);
    if (!normalizedCnpj) {
        const error = new Error('Empresa não possui CNPJ válido para gerar tokens.');
        error.status = 400;
        throw error;
    }

    return { id: company.id, cnpj: normalizedCnpj };
};

const toSafeTokenResponse = (tokenInstance) => {
    const plain = typeof tokenInstance.get === 'function' ? tokenInstance.get({ plain: true }) : tokenInstance;
    return {
        id: plain.id,
        provider: plain.provider,
        apiName: plain.apiName,
        bankName: plain.bankName,
        integrationKey: plain.integrationKey,
        preview: plain.tokenPreview,
        updatedAt: plain.updatedAt
    };
};

const saveToken = async ({ companyId, apiName, bankName, provider, token }) => {
    if (!token || !String(token).trim()) {
        throw new Error('Token da API é obrigatório.');
    }

    const targetCompany = await findCompanyOrFail(companyId);
    const normalizedApi = normalizeKeySegment(apiName);
    const normalizedBank = normalizeKeySegment(bankName);
    const normalizedProvider = normalizeKeySegment(provider) || normalizedApi;

    if (!normalizedApi) {
        throw new Error('Informe o nome da API do provedor.');
    }

    if (!normalizedBank) {
        throw new Error('Informe o banco vinculado ao token.');
    }

    const integrationKey = buildIntegrationKey({
        cnpj: targetCompany.cnpj,
        apiName: normalizedApi,
        bankName: normalizedBank
    });

    const secureValues = encryptToken(String(token), targetCompany.cnpj);
    const tokenHash = hashToken(String(token));
    const tokenPreview = buildPreview(String(token));

    const existing = await PaymentGatewayToken.findOne({
        where: {
            companyId: targetCompany.id,
            apiName: normalizedApi,
            bankName: normalizedBank
        }
    });

    let saved;

    if (!existing) {
        saved = await PaymentGatewayToken.create({
            companyId: targetCompany.id,
            companyCnpj: targetCompany.cnpj,
            provider: normalizedProvider,
            apiName: normalizedApi,
            bankName: normalizedBank,
            integrationKey,
            encryptedToken: secureValues.encryptedToken,
            encryptionIv: secureValues.encryptionIv,
            encryptionAuthTag: secureValues.encryptionAuthTag,
            tokenHash,
            tokenPreview
        });
    } else {
        existing.provider = normalizedProvider;
        existing.integrationKey = integrationKey;
        existing.companyCnpj = targetCompany.cnpj;
        existing.encryptedToken = secureValues.encryptedToken;
        existing.encryptionIv = secureValues.encryptionIv;
        existing.encryptionAuthTag = secureValues.encryptionAuthTag;
        existing.tokenHash = tokenHash;
        existing.tokenPreview = tokenPreview;
        saved = await existing.save();
    }

    logger.info(
        `Token de pagamento para ${integrationKey} salvo com sucesso (${existing ? 'atualização' : 'criação'}).`
    );

    return {
        ...toSafeTokenResponse(saved),
        source: 'database'
    };
};

const resolveTokenFromEnv = (integrationKey) => {
    const value = process.env[integrationKey];
    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
};

const getToken = async ({ companyId, apiName, bankName }) => {
    const targetCompany = await findCompanyOrFail(companyId);
    const normalizedApi = normalizeKeySegment(apiName);
    const normalizedBank = normalizeKeySegment(bankName);

    if (!normalizedApi || !normalizedBank) {
        throw new Error('Parâmetros da API e banco são obrigatórios para buscar o token.');
    }

    const integrationKey = buildIntegrationKey({
        cnpj: targetCompany.cnpj,
        apiName: normalizedApi,
        bankName: normalizedBank
    });

    const envToken = resolveTokenFromEnv(integrationKey);
    if (envToken) {
        return {
            token: envToken,
            source: 'env',
            integrationKey
        };
    }

    const record = await PaymentGatewayToken.findOne({
        where: {
            companyId: targetCompany.id,
            apiName: normalizedApi,
            bankName: normalizedBank
        }
    });

    if (!record) {
        return null;
    }

    const decrypted = decryptToken(record, targetCompany.cnpj);
    return {
        token: decrypted,
        source: 'database',
        integrationKey
    };
};

const listTokens = async (companyId) => {
    const targetCompany = await findCompanyOrFail(companyId);
    const records = await PaymentGatewayToken.findAll({
        where: { companyId: targetCompany.id },
        order: [['updatedAt', 'DESC']]
    });

    return records.map((record) => {
        const safe = toSafeTokenResponse(record);
        const envOverride = resolveTokenFromEnv(safe.integrationKey);
        return {
            ...safe,
            source: envOverride ? 'env' : 'database'
        };
    });
};

module.exports = {
    saveToken,
    getToken,
    listTokens,
    buildIntegrationKey,
    isSecretConfigured,
    normalizeCnpj,
    normalizeKeySegment,
    __testing: {
        encryptToken,
        decryptToken,
        deriveEncryptionKey,
        resolveTokenFromEnv
    }
};
