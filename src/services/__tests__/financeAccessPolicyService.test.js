process.env.NODE_ENV = 'test';
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';

const test = require('node:test');
const assert = require('node:assert/strict');

const { USER_ROLES } = require('../../constants/roles');

const resolveService = () => require.resolve('../financeAccessPolicyService');
const resolveModels = () => require.resolve('../../../database/models');

const mockModels = (mockExports) => {
    const resolved = resolveModels();
    const original = require.cache[resolved];
    require.cache[resolved] = {
        id: resolved,
        filename: resolved,
        loaded: true,
        exports: mockExports
    };

    return () => {
        if (original) {
            require.cache[resolved] = original;
        } else {
            delete require.cache[resolved];
        }
    };
};

const loadService = () => {
    delete require.cache[resolveService()];
    return require('../financeAccessPolicyService');
};

const ORIGINAL_ENV_VALUE = process.env.FINANCE_ALLOWED_ROLES;

const resetEnv = () => {
    if (ORIGINAL_ENV_VALUE === undefined) {
        delete process.env.FINANCE_ALLOWED_ROLES;
    } else {
        process.env.FINANCE_ALLOWED_ROLES = ORIGINAL_ENV_VALUE;
    }
};

test('getAllowedRoles usa fallback do ambiente quando não há política persistida', async (t) => {
    process.env.FINANCE_ALLOWED_ROLES = `${USER_ROLES.MANAGER}, ${USER_ROLES.ADMIN}`;
    const restoreModels = mockModels({
        FinanceAccessPolicy: {
            findOne: async () => null
        }
    });

    t.teardown(() => {
        restoreModels();
        resetEnv();
    });

    const service = loadService();
    const roles = await service.getAllowedRoles();

    assert.deepStrictEqual(roles, [USER_ROLES.MANAGER, USER_ROLES.ADMIN]);
});

test('getAllowedRoles aplica fallback seguro quando nenhuma role interna é configurada', async (t) => {
    process.env.FINANCE_ALLOWED_ROLES = `${USER_ROLES.CLIENT},invalid-role`;
    const restoreModels = mockModels({
        FinanceAccessPolicy: {
            findOne: async () => null
        }
    });

    t.teardown(() => {
        restoreModels();
        resetEnv();
    });

    const service = loadService();
    const roles = await service.getAllowedRoles();

    assert.deepStrictEqual(roles, [USER_ROLES.MANAGER, USER_ROLES.ADMIN]);
});

test('getAllowedRoles falha de forma segura quando nenhuma configuração está disponível', async (t) => {
    delete process.env.FINANCE_ALLOWED_ROLES;
    const restoreModels = mockModels({
        FinanceAccessPolicy: {
            findOne: async () => null
        }
    });

    t.teardown(() => {
        restoreModels();
        resetEnv();
    });

    const service = loadService();
    const roles = await service.getAllowedRoles();

    assert.deepStrictEqual(roles, [USER_ROLES.MANAGER, USER_ROLES.ADMIN]);
});

test('getFinanceAccessPolicy retorna perfis persistidos e metadados', async (t) => {
    const updatedAt = new Date('2024-10-01T10:15:00Z');
    const restoreModels = mockModels({
        FinanceAccessPolicy: {
            findOne: async () => ({
                get: () => ({
                    allowedRoles: JSON.stringify([USER_ROLES.ADMIN, USER_ROLES.MANAGER, USER_ROLES.CLIENT]),
                    updatedAt,
                    updatedByName: 'Maria CFO',
                    updatedById: 42
                })
            })
        }
    });

    delete process.env.FINANCE_ALLOWED_ROLES;

    t.teardown(() => {
        restoreModels();
        resetEnv();
    });

    const service = loadService();
    const policy = await service.getFinanceAccessPolicy();

    assert.deepStrictEqual(policy.allowedRoles, [USER_ROLES.CLIENT, USER_ROLES.MANAGER, USER_ROLES.ADMIN]);
    assert.equal(policy.source, 'database');
    assert.equal(policy.fallbackApplied, false);
    assert.equal(policy.updatedByName, 'Maria CFO');
    assert(policy.updatedAt instanceof Date);
});

test('saveFinanceAccessPolicy persiste, invalida cache e ordena perfis', async (t) => {
    let storedRecord = null;
    let findOneCalls = 0;

    const restoreModels = mockModels({
        FinanceAccessPolicy: {
            DEFAULT_POLICY_KEY: 'finance_access',
            findOne: async () => {
                findOneCalls += 1;
                if (!storedRecord) {
                    return null;
                }
                return {
                    get: () => ({
                        allowedRoles: storedRecord.allowedRoles,
                        updatedAt: storedRecord.updatedAt,
                        updatedByName: storedRecord.updatedByName,
                        updatedById: storedRecord.updatedById
                    })
                };
            },
            upsert: async (payload) => {
                storedRecord = {
                    allowedRoles: payload.allowedRoles,
                    updatedById: payload.updatedById,
                    updatedByName: payload.updatedByName,
                    updatedAt: new Date('2024-10-02T09:00:00Z')
                };
            }
        }
    });

    process.env.FINANCE_ALLOWED_ROLES = USER_ROLES.CLIENT;
    const service = loadService();

    t.teardown(() => {
        restoreModels();
        resetEnv();
    });

    const initialRoles = await service.getAllowedRoles();
    assert.deepStrictEqual(initialRoles, [USER_ROLES.MANAGER, USER_ROLES.ADMIN]);
    assert.equal(findOneCalls, 1);

    const cachedRoles = await service.getAllowedRoles();
    assert.deepStrictEqual(cachedRoles, [USER_ROLES.MANAGER, USER_ROLES.ADMIN]);
    assert.equal(findOneCalls, 1);

    const policy = await service.saveFinanceAccessPolicy({
        allowedRoles: [USER_ROLES.ADMIN, USER_ROLES.MANAGER],
        updatedBy: { id: 7, name: 'Ana Admin' }
    });

    assert.deepStrictEqual(storedRecord.allowedRoles, [USER_ROLES.MANAGER, USER_ROLES.ADMIN]);
    assert.equal(storedRecord.updatedById, 7);
    assert.equal(storedRecord.updatedByName, 'Ana Admin');

    assert.deepStrictEqual(policy.allowedRoles, [USER_ROLES.MANAGER, USER_ROLES.ADMIN]);
    assert.equal(policy.source, 'database');
    assert.equal(policy.fallbackApplied, false);

    const refreshedRoles = await service.getAllowedRoles();
    assert.deepStrictEqual(refreshedRoles, [USER_ROLES.MANAGER, USER_ROLES.ADMIN]);
    assert.equal(findOneCalls, 2);
});
