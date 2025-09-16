process.env.NODE_ENV = 'test';

const { Op } = require('sequelize');

jest.mock('../../database/models', () => {
    const sequelizeMock = {
        where: jest.fn((lhs, rhs) => ({ lhs, rhs })),
        fn: jest.fn((fnName, ...args) => ({ fnName, args })),
        col: jest.fn((column) => ({ column })),
        literal: jest.fn((value) => ({ literal: value })),
        getDialect: jest.fn(() => 'postgres')
    };

    return {
        Notification: { findAll: jest.fn() },
        User: { findAll: jest.fn() },
        Procedure: {},
        Room: {},
        Appointment: {},
        sequelize: sequelizeMock
    };
});

const models = require('../../database/models');
const { sequelize } = models;

const {
    buildFiltersFromRequest,
    formatFiltersForView
} = require('../../src/controllers/notificationController');
const { buildUserWhere } = require('../../src/services/notificationService');

describe('notificationController.buildFiltersFromRequest', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('normaliza entradas multi-valor e remove conteúdo inseguro', () => {
        const filters = buildFiltersFromRequest({
            targetNames: ' Ana<script>alert(1)</script>, Carlos; Ana ',
            userNames: ['Dr. Júlia', ''],
            targetEmails: ['ADMIN@EXAMPLE.COM ', 'invalido', 'admin@example.com'],
            targetEmailFragments: '@Empresa.Com; vendas ',
            partialEmails: 'marketing;',
            clientEmailDomain: '  @Meu-Dominio.com  ',
            targetRoles: ['ADMIN', 'manager', '---'],
            onlyActive: 'false',
            includeProfessional: 'false',
            includeClient: '0'
        });

        expect(filters.onlyActive).toBe(false);
        expect(filters.includeProfessional).toBe(false);
        expect(filters.includeClient).toBe(false);
        expect(filters.targetRoles).toEqual(['manager', 'admin']);
        expect(filters.clientEmailDomain).toBe('meu-dominio.com');
        expect(filters.targetNames).toEqual(['Ana', 'Carlos', 'Dr. Júlia']);
        expect(filters.targetEmails).toEqual(['admin@example.com']);
        expect(filters.targetEmailFragments).toEqual(['@empresa.com', 'vendas', 'marketing']);
    });
});

describe('notificationController.formatFiltersForView', () => {
    it('apresenta resumo amigável com novos filtros', () => {
        const summary = formatFiltersForView({
            onlyActive: true,
            targetRoles: ['admin'],
            targetNames: ['Ana', 'Carlos', 'Marina', 'Pedro'],
            targetEmails: ['gestao@example.com'],
            targetEmailFragments: ['@empresa.com', 'vip'],
            minimumCreditBalance: 150
        });

        expect(summary).toEqual(expect.arrayContaining([
            'Somente usuários ativos',
            'Perfis: Administrador',
            'Nomes-alvo: Ana, Carlos, Marina (+1)',
            'E-mails específicos: gestao@example.com',
            'E-mails contendo: @empresa.com, vip',
            'Crédito mínimo: R$ 150'
        ]));
    });
});

describe('notificationService.buildUserWhere', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        sequelize.getDialect.mockReturnValue('postgres');
    });

    it('cria clausulas com Op.iLike e ordena por prioridade de cargo', () => {
        const filters = {
            onlyActive: false,
            targetRoles: ['admin', 'manager'],
            targetNames: ['Ana'],
            targetEmails: ['ana@example.com'],
            targetEmailFragments: ['@empresa.com'],
            clientEmailDomain: '@empresa.com',
            minimumCreditBalance: 50
        };

        const { where, order } = buildUserWhere(filters);

        expect(where.active).toBeUndefined();
        expect(where.creditBalance[Op.gte]).toBe(50);
        expect(where.role[Op.in]).toEqual(['manager', 'admin']);
        expect(order).toHaveLength(2);
        expect(order[0][0].literal).toContain('CASE "User"."role"');
        expect(order[1]).toEqual(['name', 'ASC']);

        expect(where[Op.and]).toHaveLength(4);

        const nameCondition = where[Op.and].find((condition) => Array.isArray(condition[Op.or]) && condition[Op.or][0]?.lhs?.column === 'name');
        expect(nameCondition[Op.or][0].rhs[Op.iLike]).toBe('%Ana%');

        const emailCondition = where[Op.and].find((condition) => Array.isArray(condition[Op.or]) && condition[Op.or][0]?.lhs?.column === 'email' && !condition[Op.or][0].rhs[Op.iLike].startsWith('%'));
        expect(emailCondition[Op.or][0].rhs[Op.iLike]).toBe('ana@example.com');

        const fragmentCondition = where[Op.and].find((condition) => Array.isArray(condition[Op.or]) && condition[Op.or][0]?.rhs[Op.iLike] === '%@empresa.com%');
        expect(fragmentCondition).toBeDefined();

        const domainCondition = where[Op.and].find((condition) => !condition[Op.or]);
        expect(domainCondition.rhs[Op.iLike]).toBe('%@empresa.com');

        expect(sequelize.where).toHaveBeenCalled();
        expect(sequelize.literal).toHaveBeenCalled();
    });
});
