process.env.NODE_ENV = 'test';

const { Op } = require('sequelize');
const { buildQueryFilters } = require('../../src/utils/queryBuilder');

describe('queryBuilder.buildQueryFilters', () => {
    const defaultOptions = {
        statusField: 'active',
        statusMap: {
            active: true,
            inactive: false
        },
        allowedStatuses: [true, false],
        defaultStatus: 'active',
        dateField: 'createdAt',
        keywordFields: ['name', 'email']
    };

    it('aplica o status padrão quando nenhum filtro é informado', () => {
        const result = buildQueryFilters({}, defaultOptions);

        expect(result.where).toEqual({ active: true });
        expect(result.filters.status).toBe('active');
    });

    it('normaliza filtros complexos e trata palavra-chave numérica', () => {
        const result = buildQueryFilters(
            {
                status: 'inactive',
                keyword: '12345',
                startDate: '2024-02-10',
                endDate: '2024-02-01'
            },
            defaultOptions
        );

        expect(result.where.active).toBe(false);
        expect(result.filters.status).toBe('inactive');
        expect(result.filters.startDate).toBe('2024-02-10');
        expect(result.filters.endDate).toBe('2024-02-01');
        expect(result.metadata.keyword).toBe('12345');
        expect(result.metadata.keywordNumeric).toBe(12345);

        const likeConditions = result.metadata.orConditions;
        expect(likeConditions).toEqual(
            expect.arrayContaining([
                { name: expect.objectContaining({ [Op.iLike]: '%12345%' }) },
                { email: expect.objectContaining({ [Op.iLike]: '%12345%' }) }
            ])
        );

        const dateConditions = result.where.createdAt;
        expect(dateConditions[Op.gte]).toBeInstanceOf(Date);
        expect(dateConditions[Op.lte]).toBeInstanceOf(Date);
        expect(dateConditions[Op.gte].getTime()).toBeLessThanOrEqual(dateConditions[Op.lte].getTime());
    });
});
