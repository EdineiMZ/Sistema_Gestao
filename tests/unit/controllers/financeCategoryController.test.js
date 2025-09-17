jest.mock('../../../src/services/financeCategoryService', () => ({
    listCategories: jest.fn(),
    saveCategory: jest.fn(),
    deleteCategory: jest.fn()
}));

jest.mock('../../../src/utils/logger', () => ({
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn()
}));

const financeCategoryService = require('../../../src/services/financeCategoryService');
const financeCategoryController = require('../../../src/controllers/financeCategoryController');

const buildResponse = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
};

describe('financeCategoryController', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('list', () => {
        it('retorna categorias com sucesso', async () => {
            const categories = [{ id: 1, name: 'Fixas' }];
            financeCategoryService.listCategories.mockResolvedValue(categories);

            const req = { user: { id: 10 } };
            const res = buildResponse();

            await financeCategoryController.list(req, res);

            expect(financeCategoryService.listCategories).toHaveBeenCalledWith({ ownerId: 10 });
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                success: true,
                message: 'Operação realizada com sucesso.',
                data: categories
            });
        });

        it('mapeia erro inesperado para 500', async () => {
            const error = new Error('boom');
            financeCategoryService.listCategories.mockRejectedValue(error);

            const req = {};
            const res = buildResponse();

            await financeCategoryController.list(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
        });
    });

    describe('save', () => {
        it('cria nova categoria com sucesso', async () => {
            const category = { id: 3, name: 'Investimentos' };
            financeCategoryService.saveCategory.mockResolvedValue(category);

            const req = {
                user: { id: 12 },
                body: {
                    name: 'Investimentos',
                    slug: 'Investimentos',
                    color: '#3366ff',
                    isActive: true
                }
            };
            const res = buildResponse();

            await financeCategoryController.save(req, res);

            expect(financeCategoryService.saveCategory).toHaveBeenCalledWith(expect.objectContaining({
                ownerId: 12,
                name: 'Investimentos',
                slug: 'investimentos',
                color: '#3366ff'
            }));
            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith({
                success: true,
                message: 'Categoria criada com sucesso.',
                data: category
            });
        });

        it('retorna 400 para cor inválida', async () => {
            const req = {
                body: {
                    name: 'Serviços',
                    slug: 'servicos',
                    color: 'azul'
                }
            };
            const res = buildResponse();

            await financeCategoryController.save(req, res);

            expect(financeCategoryService.saveCategory).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: false,
                message: expect.stringContaining('Cor deve estar no formato')
            }));
        });
    });

    describe('delete', () => {
        it('remove categoria com sucesso', async () => {
            const req = { params: { id: '5' }, user: { id: 32 } };
            const res = buildResponse();

            await financeCategoryController.delete(req, res);

            expect(financeCategoryService.deleteCategory).toHaveBeenCalledWith({ id: 5, ownerId: 32 });
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                success: true,
                message: 'Categoria removida com sucesso.',
                data: null
            });
        });

        it('retorna 404 quando categoria não encontrada', async () => {
            financeCategoryService.deleteCategory.mockRejectedValue({
                code: 'CATEGORY_NOT_FOUND',
                message: 'Categoria não encontrada.'
            });

            const req = { params: { id: '6' } };
            const res = buildResponse();

            await financeCategoryController.delete(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: false,
                message: 'Categoria não encontrada.'
            }));
        });
    });
});
