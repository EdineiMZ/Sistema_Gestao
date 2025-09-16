// src/controllers/userController.js
const { User, UserNotificationPreference, sequelize } = require('../../database/models');
const { Op } = require('sequelize');
const { buildQueryFilters } = require('../utils/queryBuilder');
const { USER_ROLES, parseRole, roleAtLeast } = require('../constants/roles');


const parseDecimal = (value, fallback = 0) => {
    if (value === undefined || value === null || value === '') {
        return fallback;
    }
    const parsed = Number.parseFloat(String(value).replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : fallback;
};

const parseBooleanFlag = (value, fallback = false) => {
    if (Array.isArray(value)) {
        value = value[value.length - 1];
    }

    if (value === undefined || value === null) {
        return fallback;
    }

    if (typeof value === 'boolean') {
        return value;
    }

    if (typeof value === 'number') {
        return value !== 0;
    }

    const normalized = String(value).trim().toLowerCase();
    if (['true', 'on', '1', 'yes'].includes(normalized)) {
        return true;
    }

    if (['false', 'off', '0', 'no'].includes(normalized)) {
        return false;
    }

    return fallback;
};

const normalizeDate = (value) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : value;
};

module.exports = {
    // Exibe a página de gerenciamento de usuários (somente ativos)
    manageUsers: async (req, res) => {
        try {
            const { where, filters, metadata } = buildQueryFilters(req.query, {
                statusField: 'active',
                statusMap: {
                    active: true,
                    inactive: false
                },
                allowedStatuses: [true, false],
                defaultStatus: 'active',
                dateField: 'createdAt',
                keywordFields: ['name', 'email']
            });

            if (metadata.keywordNumeric !== null) {
                metadata.orConditions.push({ id: metadata.keywordNumeric });
            }

            if (metadata.orConditions.length) {
                where[Op.or] = metadata.orConditions;
            }

            const users = await User.findAll({
                where,
                order: [['name', 'ASC']],
                include: [
                    {
                        model: UserNotificationPreference,
                        as: 'notificationPreference'
                    }
                ]
            });

            res.render('users/manageUsers', {
                pageTitle: 'Gestão de usuários',
                users,
                filters
            });
        } catch (err) {
            console.error(err);
            req.flash('error_msg', 'Erro ao listar usuários.');
            return res.redirect('/');
        }
    },

    // Cria um novo usuário
    createUser: async (req, res) => {
        try {
            const { name, email, password, phone, address, dateOfBirth, role, creditBalance } = req.body;
            const currentUser = req.user || req.session.user || {};

            // Verificar se já existe email
            const existingUser = await User.findOne({ where: { email } });
            if (existingUser) {
                req.flash('error_msg', 'E-mail já cadastrado.');
                return res.redirect('/users/manage');
            }

            // Apenas administradores podem definir o perfil do novo usuário
            const newUserRole = roleAtLeast(currentUser.role, USER_ROLES.ADMIN)
                ? parseRole(role, USER_ROLES.CLIENT)
                : USER_ROLES.CLIENT;
            const credit = parseDecimal(creditBalance, 0);

            const payload = {
                name,
                email,
                password,
                phone,
                address,
                dateOfBirth: normalizeDate(dateOfBirth),
                role: newUserRole,
                creditBalance: credit
            };

            if (req.file) {
                payload.profileImage = req.file.buffer;
            }

            const emailOptIn = parseBooleanFlag(req.body.notificationEmailEnabled, true);
            const scheduledOptIn = parseBooleanFlag(req.body.notificationScheduledEnabled, true);

            const transaction = await sequelize.transaction();

            try {
                const newUser = await User.create(payload, { transaction });

                await UserNotificationPreference.create({
                    userId: newUser.id,
                    emailEnabled: emailOptIn,
                    scheduledEnabled: scheduledOptIn
                }, { transaction });

                await transaction.commit();
            } catch (transactionError) {
                await transaction.rollback();
                throw transactionError;
            }

            req.flash('success_msg', 'Usuário criado com sucesso!');
            return res.redirect('/users/manage');
        } catch (err) {
            console.error(err);
            req.flash('error_msg', 'Erro ao criar usuário.');
            return res.redirect('/users/manage');
        }
    },

    // Atualiza um usuário existente
    updateUser: async (req, res) => {
        try {
            const { id } = req.params;
            const { name, email, password, phone, address, dateOfBirth, role, active, creditBalance } = req.body;

            const currentUser = req.user || req.session.user || {};
            const user = await User.findByPk(id);

            if (!user) {
                req.flash('error_msg', 'Usuário não encontrado.');
                return res.redirect('/users/manage');
            }

            user.name = name;
            user.email = email;
            if (password) {
                user.password = password;
            }
            user.phone = phone;
            user.address = address;
            user.dateOfBirth = normalizeDate(dateOfBirth);

            if (roleAtLeast(currentUser.role, USER_ROLES.ADMIN)) {
                user.role = parseRole(role, user.role);
                user.active = (active === 'true');
                user.creditBalance = parseDecimal(creditBalance, 0);
            }

            if (req.file) {
                user.profileImage = req.file.buffer;
            }

            const emailOptIn = parseBooleanFlag(req.body.notificationEmailEnabled, false);
            const scheduledOptIn = parseBooleanFlag(req.body.notificationScheduledEnabled, false);

            const transaction = await sequelize.transaction();

            try {
                await user.save({ transaction });

                const [preference, created] = await UserNotificationPreference.findOrCreate({
                    where: { userId: user.id },
                    defaults: {
                        emailEnabled: emailOptIn,
                        scheduledEnabled: scheduledOptIn
                    },
                    transaction
                });

                if (
                    preference.emailEnabled !== emailOptIn ||
                    preference.scheduledEnabled !== scheduledOptIn
                ) {
                    await preference.update({
                        emailEnabled: emailOptIn,
                        scheduledEnabled: scheduledOptIn
                    }, { transaction });
                }

                await transaction.commit();
            } catch (transactionError) {
                await transaction.rollback();
                throw transactionError;
            }

            req.flash('success_msg', 'Usuário atualizado com sucesso!');
            return res.redirect('/users/manage');
        } catch (err) {
            console.error(err);
            req.flash('error_msg', 'Erro ao atualizar usuário.');
            return res.redirect('/users/manage');
        }
    },

    // Exclusão lógica
    deleteUser: async (req, res) => {
        try {
            const { id } = req.params;
            const user = await User.findByPk(id);

            if (!user) {
                req.flash('error_msg', 'Usuário não encontrado.');
                return res.redirect('/users/manage');
            }

            user.active = false;
            await user.save();

            req.flash('success_msg', 'Usuário marcado como inativo.');
            return res.redirect('/users/manage');
        } catch (err) {
            console.error(err);
            req.flash('error_msg', 'Erro ao excluir usuário.');
            return res.redirect('/users/manage');
        }
    },

    showPreferences: async (req, res) => {
        try {
            const dbUser = await User.findByPk(req.user.id, {
                include: [
                    {
                        model: UserNotificationPreference,
                        as: 'notificationPreference'
                    }
                ]
            });

            if (!dbUser) {
                req.flash('error_msg', 'Usuário não encontrado.');
                return res.redirect('/');
            }

            const preferenceInstance = dbUser.notificationPreference;
            const preference = preferenceInstance
                ? preferenceInstance.get({ plain: true })
                : { emailEnabled: true, scheduledEnabled: true };

            res.locals.notificationPreference = preference;

            return res.render('users/preferences', {
                pageTitle: 'Preferências de notificações',
                preference
            });
        } catch (err) {
            console.error('Erro ao carregar preferências do usuário:', err);
            req.flash('error_msg', 'Não foi possível carregar suas preferências no momento.');
            return res.redirect('/');
        }
    },

    updatePreferences: async (req, res) => {
        try {
            const emailOptIn = parseBooleanFlag(req.body.notificationEmailEnabled, false);
            const scheduledOptIn = parseBooleanFlag(req.body.notificationScheduledEnabled, false);

            const transaction = await sequelize.transaction();

            try {
                const [preference] = await UserNotificationPreference.findOrCreate({
                    where: { userId: req.user.id },
                    defaults: {
                        emailEnabled: emailOptIn,
                        scheduledEnabled: scheduledOptIn
                    },
                    transaction
                });

                if (
                    preference.emailEnabled !== emailOptIn ||
                    preference.scheduledEnabled !== scheduledOptIn
                ) {
                    await preference.update({
                        emailEnabled: emailOptIn,
                        scheduledEnabled: scheduledOptIn
                    }, { transaction });
                }

                await transaction.commit();
            } catch (transactionError) {
                await transaction.rollback();
                throw transactionError;
            }

            req.flash('success_msg', 'Preferências de notificações atualizadas com sucesso.');
            return res.redirect('/users/preferences');
        } catch (err) {
            console.error('Erro ao atualizar preferências do usuário:', err);
            req.flash('error_msg', 'Não foi possível atualizar suas preferências no momento.');
            return res.redirect('/users/preferences');
        }
    }
};
