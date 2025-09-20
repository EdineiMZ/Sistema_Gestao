const express = require('express');
const router = express.Router();
const financeController = require('../controllers/financeController');
const budgetController = require('../controllers/budgetController');
const { Budget } = require('../../database/models');
const authMiddleware = require('../middlewares/authMiddleware');
const permissionMiddleware = require('../middlewares/permissionMiddleware');
const audit = require('../middlewares/audit');
const financeImportUpload = require('../middlewares/financeImportUpload');
const { USER_ROLES, parseRole, sortRolesByHierarchy } = require('../constants/roles');
const { uploadAttachments } = require('../middlewares/financeAttachmentUpload');

const parseFinanceAllowedRoles = (value) => {
    const fallback = [USER_ROLES.CLIENT];

    if (value === undefined || value === null || value === '') {
        return [...fallback];
    }

    const tokens = Array.isArray(value)
        ? value
        : String(value)
            .split(/[,;|\s]+/)
            .map((item) => item.trim())
            .filter(Boolean);

    const resolved = tokens
        .map((token) => parseRole(token))
        .filter(Boolean);

    if (!resolved.length) {
        return [...fallback];
    }

    return sortRolesByHierarchy(resolved);
};

const FINANCE_ALLOWED_ROLES = parseFinanceAllowedRoles(process.env.FINANCE_ALLOWED_ROLES);
const requireFinanceAccess = permissionMiddleware(FINANCE_ALLOWED_ROLES);

const prefersJsonResponse = (req) => {
    if (req.xhr) {
        return true;
    }

    const acceptHeader = req.get('Accept');
    if (acceptHeader && acceptHeader.includes('application/json')) {
        return true;
    }

    if (req.query && (req.query.format === 'json' || req.query.format === 'JSON')) {
        return true;
    }

    return false;
};

// As rotas financeiras exigem autenticação e os perfis configurados
router.get('/', authMiddleware, requireFinanceAccess, financeController.redirectToOverview);
router.get('/overview', authMiddleware, requireFinanceAccess, financeController.renderOverview);
router.get('/payments', authMiddleware, requireFinanceAccess, financeController.renderPaymentsPage);
router.get('/investments', authMiddleware, requireFinanceAccess, financeController.renderInvestmentsPage);
router.post(
    '/import/preview',
    authMiddleware,
    requireFinanceAccess,
    financeImportUpload.single('importFile'),
    financeController.previewFinanceImport
);
router.post(
    '/import/commit',
    authMiddleware,
    requireFinanceAccess,
    audit('financeEntry.import', (req) => req.importAuditResource || 'FinanceImport'),
    financeController.commitFinanceImport
);
router.post(
    '/create',
    authMiddleware,
    requireFinanceAccess,
    uploadAttachments,
    audit('financeEntry.create', (req) => `FinanceEntry:${req.body?.description || 'novo'}`),
    financeController.createFinanceEntry
);
router.put(
    '/update/:id',
    authMiddleware,
    requireFinanceAccess,
    uploadAttachments,
    audit('financeEntry.update', (req) => `FinanceEntry:${req.params.id}`),
    financeController.updateFinanceEntry
);
router.delete(
    '/delete/:id',
    authMiddleware,
    requireFinanceAccess,
    audit('financeEntry.delete', (req) => `FinanceEntry:${req.params.id}`),
    financeController.deleteFinanceEntry
);

const adaptBudgetJsonResponse = (handler, { prepare } = {}) => async (req, res, next) => {
    const originalJson = res.json.bind(res);

    res.json = (payload) => {
        if (payload && typeof payload === 'object') {
            if (payload.success === true && Object.prototype.hasOwnProperty.call(payload, 'data')) {
                if (payload && Object.prototype.hasOwnProperty.call(payload, 'pagination') && payload.pagination !== undefined) {
                    return originalJson({
                        data: payload.data,
                        pagination: payload.pagination
                    });
                }
                return originalJson(payload.data);
            }

            if (payload.success === false && payload.message) {
                const errorResponse = { message: payload.message };
                if (payload.details) {
                    errorResponse.details = payload.details;
                }
                return originalJson(errorResponse);
            }
        }

        return originalJson(payload);
    };

    try {
        if (typeof prepare === 'function') {
            await prepare(req);
        }
        await handler(req, res, next);
    } catch (error) {
        if (error && error.__budgetValidation === true) {
            const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 400;
            res.status(statusCode).json({ message: error.message });
            return;
        }
        throw error;
    } finally {
        res.json = originalJson;
    }
};

const normalizeThresholdArray = (value) => {
    if (Array.isArray(value)) {
        return value;
    }

    if (value === undefined || value === null) {
        return [];
    }

    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) {
            return [];
        }
        return trimmed
            .split(/[;,\s]+/)
            .map((item) => item.trim())
            .filter((item) => item.length);
    }

    return [value];
};

const ensureValidBudgetThresholds = (req, { required } = {}) => {
    const list = normalizeThresholdArray(req.body?.thresholds);
    const numeric = list
        .map((item) => {
            const value = Number.parseFloat(item);
            return Number.isFinite(value) ? Number(value.toFixed(2)) : null;
        })
        .filter((item) => item !== null);

    if (!numeric.length) {
        if (required || (req.body && Object.prototype.hasOwnProperty.call(req.body, 'thresholds'))) {
            const error = new Error('Informe ao menos um limite de alerta maior que zero.');
            error.__budgetValidation = true;
            error.statusCode = 400;
            throw error;
        }
        return;
    }

    const invalid = numeric.find((value) => value <= 0);
    if (invalid !== undefined) {
        const error = new Error('Cada limite de alerta deve ser um número maior que zero.');
        error.__budgetValidation = true;
        error.statusCode = 400;
        throw error;
    }

    const unique = Array.from(new Set(numeric));
    unique.sort((a, b) => a - b);

    if (!req.body || typeof req.body !== 'object') {
        req.body = {};
    }
    req.body.thresholds = unique;
};

router.post(
    '/budgets',
    authMiddleware,
    requireFinanceAccess,
    audit('financeBudget.save', (req) => {
        const categoryId = req.body?.financeCategoryId || 'new';
        return `FinanceBudget:${categoryId}`;
    }),
    adaptBudgetJsonResponse(budgetController.save, {
        prepare: (req) => {
            ensureValidBudgetThresholds(req, { required: true });
        }
    })
);

router.get(
    '/budgets',
    authMiddleware,
    requireFinanceAccess,
    (req, res, next) => {
        if (prefersJsonResponse(req)) {
            return next();
        }
        return financeController.renderBudgetsPage(req, res, next);
    },
    audit('financeBudget.list', (req) => {
        const categoryId = req.query?.financeCategoryId || 'all';
        return `FinanceBudget:list:${categoryId}`;
    }),
    adaptBudgetJsonResponse(budgetController.list)
);

router.put(
    '/budgets/:id',
    authMiddleware,
    requireFinanceAccess,
    audit('financeBudget.save', (req) => `FinanceBudget:${req.params.id}`),
    adaptBudgetJsonResponse(budgetController.save, {
        prepare: async (req) => {
            if (!req.body || typeof req.body !== 'object') {
                req.body = {};
            }
            req.body.id = req.params.id;

            const budgetId = Number.parseInt(req.params?.id, 10);
            if (Number.isInteger(budgetId) && budgetId > 0) {
                const existing = await Budget.findByPk(budgetId);
                if (existing && req.body.financeCategoryId === undefined) {
                    req.body.financeCategoryId = existing.financeCategoryId;
                }
            }

            ensureValidBudgetThresholds(req, { required: false });
        }
    })
);

router.delete(
    '/budgets/:id',
    authMiddleware,
    requireFinanceAccess,
    audit('financeBudget.delete', (req) => `FinanceBudget:${req.params.id}`),
    adaptBudgetJsonResponse(budgetController.delete, {
        prepare: (req) => {
            if (!req.params) {
                req.params = {};
            }
            if (!req.body || typeof req.body !== 'object') {
                req.body = {};
            }
            req.body.id = req.params.id;
        }
    })
);

router.patch(
    '/budgets/:id/thresholds',
    authMiddleware,
    requireFinanceAccess,
    audit('financeBudget.updateThresholds', (req) => `FinanceBudget:${req.params.id}`),
    financeController.updateBudgetThresholds
);

router.post(
    '/goals',
    authMiddleware,
    requireFinanceAccess,
    audit('financeGoal.save', (req) => {
        const month = req.body?.month || req.body?.goalMonth || 'unknown';
        return `FinanceGoal:save:${month}`;
    }),
    financeController.saveFinanceGoal
);

router.delete(
    '/goals/:id',
    authMiddleware,
    requireFinanceAccess,
    audit('financeGoal.delete', (req) => `FinanceGoal:${req.params.id}`),
    financeController.deleteFinanceGoal
);

router.get(
    '/export/pdf',
    authMiddleware,
    requireFinanceAccess,
    audit('financeEntry.exportPdf', (req) => {
        const start = req.query?.startDate || 'all';
        const end = req.query?.endDate || 'all';
        return `FinanceExport:pdf:${start}-${end}`;
    }),
    financeController.exportPdf
);

router.get(
    '/export/excel',
    authMiddleware,
    requireFinanceAccess,
    audit('financeEntry.exportExcel', (req) => {
        const start = req.query?.startDate || 'all';
        const end = req.query?.endDate || 'all';
        return `FinanceExport:excel:${start}-${end}`;
    }),
    financeController.exportExcel
);

router.get(
    '/attachments/:attachmentId/download',
    authMiddleware,
    requireFinanceAccess,
    audit('financeAttachment.download', (req) => `FinanceAttachment:${req.params.attachmentId}`),
    financeController.downloadAttachment
);


module.exports = router;