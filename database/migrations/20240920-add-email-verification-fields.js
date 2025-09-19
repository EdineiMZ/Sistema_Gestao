'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.sequelize.transaction(async (transaction) => {
            const tableDefinition = await queryInterface.describeTable('Users', { transaction });

            if (!tableDefinition.emailVerifiedAt) {
                await queryInterface.addColumn('Users', 'emailVerifiedAt', {
                    type: Sequelize.DATE,
                    allowNull: true
                }, { transaction });
            }

            if (!tableDefinition.emailVerificationTokenHash) {
                await queryInterface.addColumn('Users', 'emailVerificationTokenHash', {
                    type: Sequelize.STRING(128),
                    allowNull: true
                }, { transaction });
            }

            if (!tableDefinition.emailVerificationTokenExpiresAt) {
                await queryInterface.addColumn('Users', 'emailVerificationTokenExpiresAt', {
                    type: Sequelize.DATE,
                    allowNull: true
                }, { transaction });
            }

            const indexes = await queryInterface.showIndex('Users', { transaction });
            const hasIndex = indexes.some((index) => index.name === 'users_email_verification_token_hash_idx');

            if (!hasIndex) {
                await queryInterface.addIndex('Users', ['emailVerificationTokenHash'], {
                    name: 'users_email_verification_token_hash_idx',
                    transaction
                });
            }
        });
    },

    async down(queryInterface) {
        await queryInterface.sequelize.transaction(async (transaction) => {
            const tableDefinition = await queryInterface.describeTable('Users', { transaction });

            const indexes = await queryInterface.showIndex('Users', { transaction });
            const hasIndex = indexes.some((index) => index.name === 'users_email_verification_token_hash_idx');

            if (hasIndex) {
                await queryInterface.removeIndex('Users', 'users_email_verification_token_hash_idx', { transaction });
            }

            if (tableDefinition.emailVerificationTokenExpiresAt) {
                await queryInterface.removeColumn('Users', 'emailVerificationTokenExpiresAt', { transaction });
            }

            if (tableDefinition.emailVerificationTokenHash) {
                await queryInterface.removeColumn('Users', 'emailVerificationTokenHash', { transaction });
            }

            if (tableDefinition.emailVerifiedAt) {
                await queryInterface.removeColumn('Users', 'emailVerifiedAt', { transaction });
            }
        });
    }
};
