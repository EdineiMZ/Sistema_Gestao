const logger = require('../utils/logger');

const CACHE_TTL_MS = Math.max(Number(process.env.COMPANY_LOOKUP_CACHE_TTL_MS) || 6 * 60 * 60 * 1000, 60 * 1000);
const API_TIMEOUT_MS = Math.max(Number(process.env.COMPANY_LOOKUP_TIMEOUT_MS) || 5000, 1000);
const API_ENDPOINT = 'https://api.invertexto.com/v1/cnpj';
const cacheStore = new Map();

class CompanyLookupError extends Error {
    constructor(message, { status = 502, code } = {}) {
        super(message);
        this.name = 'CompanyLookupError';
        this.status = status;
        this.code = code || 'COMPANY_LOOKUP_ERROR';
    }
}

const extractDigits = (value) => {
    if (!value && value !== 0) {
        return '';
    }

    return String(value).replace(/\D+/g, '');
};

const sanitizeCnpj = (value) => {
    const digits = extractDigits(value);
    return digits.length === 14 ? digits : null;
};

const sanitizeZipCode = (value) => {
    const digits = extractDigits(value);
    return digits.length === 8 ? digits : null;
};

const normalizeStatus = (rawStatus) => {
    if (typeof rawStatus !== 'string') {
        return 'inactive';
    }

    const normalized = rawStatus.trim().toLowerCase();
    if (['ativa', 'ativo', 'active'].includes(normalized)) {
        return 'active';
    }

    return 'inactive';
};

const resolvePrimaryActivity = (activity) => {
    if (!activity) {
        return null;
    }

    const entry = Array.isArray(activity) ? activity[0] : activity;
    if (entry && typeof entry === 'object') {
        return {
            code: entry.codigo || entry.code || null,
            description: entry.descricao || entry.description || null
        };
    }

    return {
        code: null,
        description: String(entry)
    };
};

const mapApiResponse = (payload = {}) => {
    const endereco = payload.endereco || payload.address || {};
    const situacao = payload.situacao || payload.status_info || {};
    const regimeTributario = payload.regime_tributario || payload.regimeTributario || null;
    const primaryActivity = resolvePrimaryActivity(payload.atividade_principal);

    const city =
        endereco.municipio?.nome ||
        endereco.municipio ||
        endereco.cidade ||
        payload.municipio ||
        payload.cidade ||
        null;

    const state =
        endereco.estado?.sigla ||
        endereco.estado?.uf ||
        (typeof endereco.estado === 'string' ? endereco.estado : null) ||
        endereco.uf ||
        payload.uf ||
        null;

    const country =
        endereco.pais?.nome ||
        endereco.pais ||
        payload.pais ||
        'Brasil';

    let taxRegime = regimeTributario;
    if (taxRegime && typeof taxRegime === 'object') {
        taxRegime = taxRegime.nome || taxRegime.descricao || taxRegime.description || null;
    }

    const statusSource = typeof situacao === 'object' && situacao !== null ? situacao.nome || situacao.descricao : situacao;

    return {
        cnpj: sanitizeCnpj(payload.cnpj || payload.numero || payload.cnpj_raiz),
        corporateName: payload.razao_social || payload.nome || null,
        tradeName: payload.nome_fantasia || payload.fantasia || null,
        stateRegistration: payload.inscricao_estadual || null,
        municipalRegistration: payload.inscricao_municipal || null,
        taxRegime: taxRegime || payload.tipo || null,
        email: payload.email || null,
        phone: payload.telefone || payload.telefone1 || null,
        mobilePhone: payload.telefone2 || null,
        website: payload.site || null,
        openingDate: payload.data_inicio || payload.abertura || payload.data_abertura || null,
        zipCode: sanitizeZipCode(endereco.cep || payload.cep) || null,
        addressLine: endereco.logradouro || payload.logradouro || payload.endereco || null,
        number: endereco.numero || payload.numero || null,
        complement: endereco.complemento || payload.complemento || null,
        neighborhood: endereco.bairro || payload.bairro || null,
        city,
        state,
        country,
        status: normalizeStatus(statusSource || payload.status),
        primaryActivity
    };
};

const setCacheValue = (cnpj, data) => {
    cacheStore.set(cnpj, {
        expiresAt: Date.now() + CACHE_TTL_MS,
        data
    });
};

const getCacheValue = (cnpj) => {
    const cached = cacheStore.get(cnpj);
    if (!cached) {
        return null;
    }

    if (cached.expiresAt <= Date.now()) {
        cacheStore.delete(cnpj);
        return null;
    }

    return cached.data;
};

const requestFromApi = async (cnpj) => {
    const token = (process.env.INVERTEXTO_API_TOKEN || '').trim();
    if (!token) {
        throw new CompanyLookupError('Token da API Invertexto não configurado.', {
            status: 503,
            code: 'MISSING_TOKEN'
        });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    try {
        const response = await fetch(`${API_ENDPOINT}/${cnpj}?token=${encodeURIComponent(token)}`, {
            method: 'GET',
            signal: controller.signal,
            headers: {
                Accept: 'application/json'
            }
        });

        if (!response.ok) {
            const text = await response.text();
            throw new CompanyLookupError('Falha na consulta de CNPJ.', {
                status: response.status,
                code: 'HTTP_ERROR',
                details: text
            });
        }

        const payload = await response.json();
        if (payload?.error) {
            throw new CompanyLookupError(payload.error || 'Resposta inválida da API Invertexto.', {
                status: 422,
                code: 'API_ERROR'
            });
        }

        const mapped = mapApiResponse(payload);
        if (!mapped.cnpj) {
            throw new CompanyLookupError('A API retornou dados sem CNPJ válido.', {
                status: 422,
                code: 'INVALID_PAYLOAD'
            });
        }

        return {
            ...mapped,
            fetchedAt: new Date().toISOString()
        };
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new CompanyLookupError('Tempo excedido na consulta de CNPJ.', {
                status: 504,
                code: 'TIMEOUT'
            });
        }

        if (error instanceof CompanyLookupError) {
            throw error;
        }

        logger.error('Erro inesperado ao consultar API Invertexto', error);
        throw new CompanyLookupError('Erro inesperado ao consultar CNPJ.', {
            status: 502,
            code: 'UNEXPECTED_ERROR'
        });
    } finally {
        clearTimeout(timeout);
    }
};

const lookupCompanyByCnpj = async (cnpj, { forceRefresh = false } = {}) => {
    const sanitized = sanitizeCnpj(cnpj);
    if (!sanitized) {
        throw new CompanyLookupError('CNPJ inválido para consulta.', {
            status: 400,
            code: 'INVALID_CNPJ'
        });
    }

    if (!forceRefresh) {
        const cached = getCacheValue(sanitized);
        if (cached) {
            return { ...cached, cached: true };
        }
    }

    const data = await requestFromApi(sanitized);
    setCacheValue(sanitized, data);
    return { ...data, cached: false };
};

const clearCompanyLookupCache = (cnpj) => {
    if (!cnpj) {
        cacheStore.clear();
        return;
    }

    const sanitized = sanitizeCnpj(cnpj);
    if (sanitized) {
        cacheStore.delete(sanitized);
    }
};

module.exports = {
    lookupCompanyByCnpj,
    clearCompanyLookupCache,
    CompanyLookupError
};
