'use strict';

const argon2 = require('argon2');
const { USER_ROLES } = require('../../src/constants/roles');

const ADMIN_EMAIL = 'admin.default@local.test';
const ADMIN_NAME = 'User Admin';
const ADMIN_PASSWORD = 'adminadmin';

const parsePositiveInt = (value, fallback) => {
    if (value === undefined || value === null || value === '') {
        return fallback;
    }

    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const ARGON2_OPTIONS = {
    type: argon2.argon2id,
    timeCost: parsePositiveInt(process.env.ARGON2_TIME_COST, 3),
    memoryCost: parsePositiveInt(process.env.ARGON2_MEMORY_COST, 2 ** 16),
    parallelism: parsePositiveInt(process.env.ARGON2_PARALLELISM, 1)
};

const findAdminByEmail = async (queryInterface, transaction) => {
    const [results] = await queryInterface.sequelize.query(
        'SELECT 1 FROM "Users" WHERE "email" = :email LIMIT 1;',
        {
            transaction,
            replacements: { email: ADMIN_EMAIL }
        }
    );

    return Boolean(results?.length);
};

module.exports = {
    async up(queryInterface) {
        await queryInterface.sequelize.transaction(async (transaction) => {
            const exists = await findAdminByEmail(queryInterface, transaction);
            if (exists) {
                return;
            }

            const passwordHash = await argon2.hash(ADMIN_PASSWORD, ARGON2_OPTIONS);
            const now = new Date();

            await queryInterface.bulkInsert(
                'Users',
                [
                    {
                        name: ADMIN_NAME,
                        email: ADMIN_EMAIL,
                        password: passwordHash,
                        role: USER_ROLES.ADMIN,
                        active: true,
                        creditBalance: 0,
                        createdAt: now,
                        updatedAt: now
                    }
                ],
                { transaction }
            );
        });
    },

    async down(queryInterface) {
        await queryInterface.sequelize.transaction(async (transaction) => {
            await queryInterface.bulkDelete(
                'Users',
                { email: ADMIN_EMAIL },
                { transaction }
            );
        });
    }
};
