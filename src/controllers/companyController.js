const { Op } = require('sequelize');
const { Company, User, sequelize } = require('../../database/models');
const logger = require('../utils/logger');
const { DEFAULT_COMPANY_ACCESS_LEVEL, normalizeCompanyAccessLevel } = require('../constants/companyAccessLevels');
const { lookupCompanyByCnpj, CompanyLookupError } = require('../services/companyLookup');
const paymentTokenService = require('../services/paymentTokenService');

const STATUS_VALUES = ['active', 'inactive'];
const LIKE_OPERATOR =
    typeof sequelize?.getDialect === 'function' && sequelize.getDialect().toLowerCase() === 'postgres'
        ? Op.iLike
        : Op.like;

const sanitizeDigits = (value) => {
    if (value === undefined || value === null) {
        return null;
    }

    const digits = String(value).replace(/\D+/g, '');
    return digits.length ? digits : null;
};

const normalizeStatus = (value) => {
    if (typeof value !== 'string') {
        return 'active';
    }

    const normalized = value.trim().toLowerCase();
    return STATUS_VALUES.includes(normalized) ? normalized : 'active';
};

const normalizeOptionalString = (value) => {
    if (value === undefined || value === null) {
        return null;
    }

    const trimmed = String(value).trim();
    return trimmed.length ? trimmed : null;
};

const normalizeDate = (value) => {
    if (!value) {
        return null;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return null;
    }

    return value instanceof Date ? value.toISOString().split('T')[0] : String(value).slice(0, 10);
};

const buildCompanyPayload = (body = {}) => ({
    cnpj: sanitizeDigits(body.cnpj),
    corporateName: normalizeOptionalString(body.corporateName) || '',
    tradeName: normalizeOptionalString(body.tradeName),
    stateRegistration: normalizeOptionalString(body.stateRegistration),
    municipalRegistration: normalizeOptionalString(body.municipalRegistration),
    taxRegime: normalizeOptionalString(body.taxRegime),
    email: normalizeOptionalString(body.email),
    phone: normalizeOptionalString(body.phone),
    mobilePhone: normalizeOptionalString(body.mobilePhone),
    website: normalizeOptionalString(body.website),
    openingDate: normalizeDate(body.openingDate),
    zipCode: sanitizeDigits(body.zipCode),
    addressLine: normalizeOptionalString(body.addressLine),
    number: normalizeOptionalString(body.number),
    complement: normalizeOptionalString(body.complement),
    neighborhood: normalizeOptionalString(body.neighborhood),
    city: normalizeOptionalString(body.city),
    state: normalizeOptionalString(body.state),
    country: normalizeOptionalString(body.country) || 'Brasil',
    status: normalizeStatus(body.status),
    notes: normalizeOptionalString(body.notes)
});

const toPlainCompany = (instance) => {
    if (!instance) {
        return null;
    }

    if (typeof instance.get === 'function') {
        return instance.get({ plain: true });
    }

    if (typeof instance.toJSON === 'function') {
        return instance.toJSON();
    }

    return { ...instance };
};

const findCompanyOrFail = async (id) => {
    const company = await Company.findByPk(id);
    if (!company) {
        const error = new Error('Empresa não encontrada.');
        error.status = 404;
        throw error;
    }
    return company;
};

const loadCompanyWithUsers = async (id) => {
    return Company.findByPk(id, {
        include: [
            {
                model: User,
                as: 'users',
                attributes: ['id', 'name', 'email', 'companyAccessLevel', 'role']
            }
        ]
    });
};

const companyController = {
    list: async (req, res) => {
        try {
            const { q, status } = req.query || {};
            const where = {};

            if (q) {
                const keyword = String(q).trim();
                if (keyword) {
                    const sanitizedKeyword = keyword.replace(/[%_]/g, '');
                    const like = `%${sanitizedKeyword}%`;
                    const digits = keyword.replace(/\D+/g, '');
                    const orConditions = [
                        { corporateName: { [LIKE_OPERATOR]: like } },
                        { tradeName: { [LIKE_OPERATOR]: like } }
                    ];

                    if (digits.length >= 4) {
                        orConditions.push({ cnpj: { [Op.like]: `%${digits}%` } });
                    }

                    where[Op.or] = orConditions;
                }
            }

            if (status && STATUS_VALUES.includes(status)) {
                where.status = status;
            }

            const companies = await Company.findAll({
                where,
                order: [['corporateName', 'ASC']]
            });

            res.render('companies/index', {
                pageTitle: 'Empresas',
                companies,
                filters: { q, status }
            });
        } catch (error) {
            logger.error('Erro ao listar empresas', error);
            req.flash('error_msg', 'Não foi possível carregar a lista de empresas.');
            res.redirect('/admin');
        }
    },

    showCreateForm: (req, res) => {
        res.render('companies/form', {
            pageTitle: 'Nova empresa',
            company: {
                status: 'active',
                companyAccessLevel: DEFAULT_COMPANY_ACCESS_LEVEL
            },
            mode: 'create',
            paymentTokens: [],
            tokenSecretConfigured: paymentTokenService.isSecretConfigured()
        });
    },

    create: async (req, res) => {
        try {
            const payload = buildCompanyPayload(req.body);
            if (!payload.corporateName) {
                req.flash('error_msg', 'Razão social é obrigatória.');
                return res.redirect('/admin/companies/new');
            }

            await Company.create(payload);
            req.flash('success_msg', 'Empresa cadastrada com sucesso.');
            res.redirect('/admin/companies');
        } catch (error) {
            logger.error('Erro ao criar empresa', error);
            const message = error?.errors?.[0]?.message || 'Erro ao cadastrar empresa.';
            req.flash('error_msg', message);
            res.redirect('/admin/companies/new');
        }
    },

    showEditForm: async (req, res) => {
        try {
            const company = await loadCompanyWithUsers(req.params.id);
            if (!company) {
                req.flash('error_msg', 'Empresa não encontrada.');
                return res.redirect('/admin/companies');
            }

            const plainCompany = toPlainCompany(company);
            const paymentTokens = await paymentTokenService.listTokens(company.id).catch((error) => {
                logger.error('Erro ao listar tokens de pagamento', error);
                return [];
            });

            res.render('companies/form', {
                pageTitle: 'Editar empresa',
                company: plainCompany,
                mode: 'edit',
                paymentTokens,
                tokenSecretConfigured: paymentTokenService.isSecretConfigured(),
                normalizedCompanyCnpj: paymentTokenService.normalizeCnpj(plainCompany.cnpj)
            });
        } catch (error) {
            logger.error('Erro ao exibir formulário de empresa', error);
            req.flash('error_msg', 'Não foi possível carregar a empresa.');
            res.redirect('/admin/companies');
        }
    },

    savePaymentToken: async (req, res) => {
        const { id } = req.params;
        const { apiName, bankName, provider, token } = req.body || {};

        try {
            await paymentTokenService.saveToken({
                companyId: id,
                apiName,
                bankName,
                provider,
                token
            });

            req.flash('success_msg', 'Token de pagamento salvo com sucesso.');
            res.redirect(`/admin/companies/${id}/edit`);
        } catch (error) {
            if (error.status === 404) {
                req.flash('error_msg', 'Empresa não encontrada.');
                return res.redirect('/admin/companies');
            }

            logger.error('Erro ao salvar token de pagamento', error);

            if (error.code === 'TOKEN_SECRET_MISSING') {
                req.flash('error_msg', 'Configure a variável PAYMENT_TOKEN_SECRET para salvar tokens com segurança.');
            } else {
                req.flash('error_msg', error.message || 'Não foi possível salvar o token de pagamento.');
            }

            res.redirect(`/admin/companies/${id}/edit`);
        }
    },

    update: async (req, res) => {
        const { id } = req.params;
        try {
            const company = await findCompanyOrFail(id);
            const payload = buildCompanyPayload(req.body);
            if (!payload.corporateName) {
                req.flash('error_msg', 'Razão social é obrigatória.');
                return res.redirect(`/admin/companies/${id}/edit`);
            }

            await company.update(payload);
            req.flash('success_msg', 'Empresa atualizada com sucesso.');
            res.redirect('/admin/companies');
        } catch (error) {
            if (error.status === 404) {
                req.flash('error_msg', 'Empresa não encontrada.');
                return res.redirect('/admin/companies');
            }

            logger.error('Erro ao atualizar empresa', error);
            const message = error?.errors?.[0]?.message || 'Erro ao atualizar empresa.';
            req.flash('error_msg', message);
            res.redirect(`/admin/companies/${id}/edit`);
        }
    },

    remove: async (req, res) => {
        const { id } = req.params;
        try {
            const company = await findCompanyOrFail(id);
            await sequelize.transaction(async (transaction) => {
                await User.update(
                    { companyId: null, companyAccessLevel: DEFAULT_COMPANY_ACCESS_LEVEL },
                    { where: { companyId: id }, transaction }
                );
                await company.destroy({ transaction });
            });

            req.flash('success_msg', 'Empresa removida com sucesso.');
            res.redirect('/admin/companies');
        } catch (error) {
            if (error.status === 404) {
                req.flash('error_msg', 'Empresa não encontrada.');
                return res.redirect('/admin/companies');
            }

            logger.error('Erro ao remover empresa', error);
            req.flash('error_msg', 'Não foi possível remover a empresa.');
            res.redirect('/admin/companies');
        }
    },

    lookupByCnpj: async (req, res) => {
        try {
            const { cnpj, forceRefresh } = req.body || req.query || {};
            const data = await lookupCompanyByCnpj(cnpj, { forceRefresh: forceRefresh === 'true' });
            res.json({ success: true, data });
        } catch (error) {
            if (error instanceof CompanyLookupError) {
                return res.status(error.status).json({
                    success: false,
                    message: error.message,
                    code: error.code
                });
            }

            logger.error('Erro inesperado ao consultar CNPJ', error);
            res.status(500).json({ success: false, message: 'Erro inesperado ao consultar CNPJ.' });
        }
    },

    manageUsers: async (req, res) => {
        try {
            const company = await loadCompanyWithUsers(req.params.id);
            if (!company) {
                req.flash('error_msg', 'Empresa não encontrada.');
                return res.redirect('/admin/companies');
            }

            const availableUsers = await User.findAll({
                where: {
                    [Op.or]: [{ companyId: null }, { companyId: company.id }]
                },
                order: [['name', 'ASC']]
            });

            res.render('companies/manageUsers', {
                pageTitle: 'Gestão de usuários da empresa',
                company: toPlainCompany(company),
                availableUsers
            });
        } catch (error) {
            logger.error('Erro ao carregar usuários da empresa', error);
            req.flash('error_msg', 'Não foi possível carregar os usuários da empresa.');
            res.redirect('/admin/companies');
        }
    },

    attachUser: async (req, res) => {
        const { id } = req.params;
        const { userId, accessLevel } = req.body || {};

        try {
            const company = await findCompanyOrFail(id);
            const user = await User.findByPk(userId);
            if (!user) {
                req.flash('error_msg', 'Usuário não encontrado.');
                return res.redirect(`/admin/companies/${id}/users`);
            }

            const normalizedAccessLevel = normalizeCompanyAccessLevel(accessLevel);

            await sequelize.transaction(async (transaction) => {
                await user.update(
                    { companyId: company.id, companyAccessLevel: normalizedAccessLevel },
                    { transaction }
                );
            });

            req.flash('success_msg', 'Usuário vinculado à empresa com sucesso.');
            res.redirect(`/admin/companies/${id}/users`);
        } catch (error) {
            if (error.status === 404) {
                req.flash('error_msg', 'Empresa não encontrada.');
                return res.redirect('/admin/companies');
            }

            logger.error('Erro ao vincular usuário à empresa', error);
            req.flash('error_msg', 'Não foi possível vincular o usuário à empresa.');
            res.redirect(`/admin/companies/${id}/users`);
        }
    },

    updateUserAccess: async (req, res) => {
        const { id, userId } = req.params;
        const { accessLevel } = req.body || {};

        try {
            await findCompanyOrFail(id);
            const user = await User.findOne({ where: { id: userId, companyId: id } });
            if (!user) {
                req.flash('error_msg', 'Usuário não encontrado para esta empresa.');
                return res.redirect(`/admin/companies/${id}/users`);
            }

            const normalizedAccessLevel = normalizeCompanyAccessLevel(accessLevel);
            await user.update({ companyAccessLevel: normalizedAccessLevel });

            req.flash('success_msg', 'Nível de acesso atualizado com sucesso.');
            res.redirect(`/admin/companies/${id}/users`);
        } catch (error) {
            if (error.status === 404) {
                req.flash('error_msg', 'Empresa não encontrada.');
                return res.redirect('/admin/companies');
            }

            logger.error('Erro ao atualizar acesso do usuário na empresa', error);
            req.flash('error_msg', 'Não foi possível atualizar o acesso do usuário.');
            res.redirect(`/admin/companies/${id}/users`);
        }
    },

    detachUser: async (req, res) => {
        const { id, userId } = req.params;

        try {
            await findCompanyOrFail(id);
            const user = await User.findOne({ where: { id: userId, companyId: id } });
            if (!user) {
                req.flash('error_msg', 'Usuário não encontrado para esta empresa.');
                return res.redirect(`/admin/companies/${id}/users`);
            }

            await user.update({ companyId: null, companyAccessLevel: DEFAULT_COMPANY_ACCESS_LEVEL });
            req.flash('success_msg', 'Usuário desvinculado da empresa.');
            res.redirect(`/admin/companies/${id}/users`);
        } catch (error) {
            if (error.status === 404) {
                req.flash('error_msg', 'Empresa não encontrada.');
                return res.redirect('/admin/companies');
            }

            logger.error('Erro ao desvincular usuário da empresa', error);
            req.flash('error_msg', 'Não foi possível desvincular o usuário.');
            res.redirect(`/admin/companies/${id}/users`);
        }
    }
};

module.exports = companyController;
