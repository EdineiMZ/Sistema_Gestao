const { Procedure, Room } = require('../../database/models');

module.exports = {
    listProcedures: async (req, res) => {
        try {
            const procedures = await Procedure.findAll({
                include: [{ model: Room, as: 'room' }]
            });
            res.render('procedures/manageProcedures', { procedures });
        } catch (err) {
            console.error('Erro ao listar procedimentos:', err);
            req.flash('error_msg', 'Erro ao listar procedimentos.');
            res.redirect('/');
        }
    },

    showCreate: async (req, res) => {
        try {
            const rooms = await Room.findAll({ where: { active: true } });
            res.render('procedures/createProcedure', { rooms });
        } catch (err) {
            console.error(err);
            req.flash('error_msg', 'Erro ao exibir form de procedimento.');
            res.redirect('/procedures');
        }
    },

    createProcedure: async (req, res) => {
        try {
            const currentUser = req.session.user;
            const { name, price, active, requiresRoom, roomId, estimatedTime,
                commissionType, commissionValue } = req.body;

            let finalRoomId = null;
            if (requiresRoom === 'true') {
                finalRoomId = roomId || null;
            }

            await Procedure.create({
                name,
                price,
                active: (active === 'true'),
                requiresRoom: (requiresRoom === 'true'),
                roomId: finalRoomId,
                estimatedTime: estimatedTime || null,
                commissionType: commissionType || null,
                commissionValue: commissionValue || null,
                createdBy: currentUser ? currentUser.id : null
            });

            req.flash('success_msg', 'Procedimento criado com sucesso!');
            res.redirect('/procedures');
        } catch (err) {
            console.error('Erro ao criar procedimento:', err);
            req.flash('error_msg', 'Erro ao criar procedimento.');
            res.redirect('/procedures');
        }
    },

    showEdit: async (req, res) => {
        try {
            const { id } = req.params;
            const proc = await Procedure.findByPk(id);
            if (!proc) {
                req.flash('error_msg', 'Procedimento não encontrado.');
                return res.redirect('/procedures');
            }
            const rooms = await Room.findAll({ where: { active: true } });
            res.render('procedures/editProcedure', { procedure: proc, rooms });
        } catch (err) {
            console.error('Erro ao exibir edição de procedimento:', err);
            req.flash('error_msg', 'Erro ao exibir edição.');
            res.redirect('/procedures');
        }
    },

    updateProcedure: async (req, res) => {
        try {
            const { id } = req.params;
            const { name, price, active, requiresRoom, roomId, estimatedTime,
                commissionType, commissionValue } = req.body;

            const proc = await Procedure.findByPk(id);
            if (!proc) {
                req.flash('error_msg', 'Procedimento não encontrado.');
                return res.redirect('/procedures');
            }

            proc.name = name;
            proc.price = price;
            proc.active = (active === 'true');
            proc.requiresRoom = (requiresRoom === 'true');
            proc.roomId = (requiresRoom === 'true') ? roomId : null;
            proc.estimatedTime = estimatedTime || null;
            proc.commissionType = commissionType || null;
            proc.commissionValue = commissionValue || null;

            await proc.save();
            req.flash('success_msg', 'Procedimento atualizado com sucesso!');
            res.redirect('/procedures');
        } catch (err) {
            console.error(err);
            req.flash('error_msg', 'Erro ao atualizar procedimento.');
            res.redirect('/procedures');
        }
    },

    deleteProcedure: async (req, res) => {
        try {
            const { id } = req.params;
            const proc = await Procedure.findByPk(id);
            if (!proc) {
                req.flash('error_msg', 'Procedimento não encontrado.');
                return res.redirect('/procedures');
            }
            await proc.destroy();
            req.flash('success_msg', 'Procedimento removido com sucesso.');
            res.redirect('/procedures');
        } catch (err) {
            console.error(err);
            req.flash('error_msg', 'Erro ao excluir procedimento.');
            res.redirect('/procedures');
        }
    }
};
