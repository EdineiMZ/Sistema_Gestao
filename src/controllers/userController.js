// src/controllers/userController.js
const { User } = require('../../database/models');
const { Op } = require('sequelize');
const bcrypt = require('bcrypt');
const { buildQueryFilters } = require('../utils/queryBuilder');

const parseDecimal = (value, fallback = 0) => {
    if (value === undefined || value === null || value === '') {
        return fallback;
    }
    const parsed = Number.parseFloat(String(value).replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeDate = (value) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : value;
};

const parseRole = (value, fallback = 0) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) ? parsed : fallback;
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
                order: [['name', 'ASC']]
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
            const currentUser = req.session.user || {};

            // Verificar se já existe email
            const existingUser = await User.findOne({ where: { email } });
            if (existingUser) {
                req.flash('error_msg', 'E-mail já cadastrado.');
                return res.redirect('/users/manage');
            }

            // Se quem está criando for admin (role=4), define a role; caso contrário, 0
            const newUserRole = currentUser.role === 4 ? parseRole(role, 0) : 0;
            const credit = parseDecimal(creditBalance, 0);

            const payload = {
                name,
                email,
                password,
                phone,
                address,
                dateOfBirth: normalizeDate(dateOfBirth),
                role: Number.isInteger(newUserRole) ? newUserRole : 0,
                creditBalance: credit
            };

            if (req.file) {
                payload.profileImage = req.file.buffer;
            }

            await User.create(payload);

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

            const currentUser = req.session.user;
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

            if (currentUser.role === 4) {
                user.role = parseRole(role, user.role);
                user.active = (active === 'true');
                user.creditBalance = parseDecimal(creditBalance, 0);
            }

            if (req.file) {
                user.profileImage = req.file.buffer;
            }

            await user.save();
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
    }
};
