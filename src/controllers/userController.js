// src/controllers/userController.js
const { User } = require('../../database/models');
const bcrypt = require('bcrypt');

module.exports = {
    // Exibe a página de gerenciamento de usuários (somente ativos)
    manageUsers: async (req, res) => {
        try {
            const users = await User.findAll({
                where: { active: true }
            });
            res.render('users/manageUsers', { users });
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
            const currentUser = req.session.user;

            // Verificar se já existe email
            const existingUser = await User.findOne({ where: { email } });
            if (existingUser) {
                req.flash('error_msg', 'E-mail já cadastrado.');
                return res.redirect('/users/manage');
            }

            // Se quem está criando for admin (role=4), define a role; caso contrário, 0
            const newUserRole = (currentUser.role === 4) ? role : 0;

            await User.create({
                name,
                email,
                password,
                phone,
                address,
                dateOfBirth,
                role: newUserRole || 0,
                // NOVO: define creditBalance
                creditBalance: creditBalance || 0
            });

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
            user.dateOfBirth = dateOfBirth;

            if (currentUser.role === 4) {
                user.role = role;
                user.active = (active === 'true');
                // NOVO: define ou altera creditBalance
                user.creditBalance = creditBalance || 0;
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
