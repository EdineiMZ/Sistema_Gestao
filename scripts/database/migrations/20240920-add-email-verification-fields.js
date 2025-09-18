'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn('Users', 'emailVerifiedAt', {
            type: Sequelize.DATE,
            allowNull: true
        });

        await queryInterface.addColumn('Users', 'emailVerificationTokenHash', {
            type: Sequelize.STRING(128),
            allowNull: true
        });

        await queryInterface.addColumn('Users', 'emailVerificationTokenExpiresAt', {
            type: Sequelize.DATE,
            allowNull: true
        });

        await queryInterface.addIndex('Users', ['emailVerificationTokenHash'], {
            name: 'users_email_verification_token_hash_idx'
        });
    },

    async down(queryInterface) {
        await queryInterface.removeIndex('Users', 'users_email_verification_token_hash_idx');
        await queryInterface.removeColumn('Users', 'emailVerificationTokenExpiresAt');
        await queryInterface.removeColumn('Users', 'emailVerificationTokenHash');
        await queryInterface.removeColumn('Users', 'emailVerifiedAt');
    }
};
