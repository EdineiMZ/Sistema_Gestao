const { Room } = require('../../database/models');

module.exports = {
    listRooms: async (req, res) => {
        try {
            const rooms = await Room.findAll();
            res.render('rooms/manageRooms', { rooms });
        } catch (err) {
            console.error(err);
            req.flash('error_msg', 'Erro ao listar salas.');
            return res.redirect('/');
        }
    },

    createRoom: async (req, res) => {
        try {
            const { name, active } = req.body;

            await Room.create({
                name,
                active: (active === 'true')
            });

            req.flash('success_msg', 'Sala criada com sucesso!');
            return res.redirect('/rooms');
        } catch (err) {
            console.error(err);
            req.flash('error_msg', 'Erro ao criar sala.');
            return res.redirect('/rooms');
        }
    },

    updateRoom: async (req, res) => {
        try {
            const { id } = req.params;
            const { name, active } = req.body;

            const room = await Room.findByPk(id);
            if (!room) {
                req.flash('error_msg', 'Sala não encontrada.');
                return res.redirect('/rooms');
            }

            room.name = name;
            room.active = (active === 'true');

            await room.save();

            req.flash('success_msg', 'Sala atualizada com sucesso!');
            return res.redirect('/rooms');
        } catch (err) {
            console.error(err);
            req.flash('error_msg', 'Erro ao atualizar sala.');
            return res.redirect('/rooms');
        }
    },

    deleteRoom: async (req, res) => {
        try {
            const { id } = req.params;
            const room = await Room.findByPk(id);
            if (!room) {
                req.flash('error_msg', 'Sala não encontrada.');
                return res.redirect('/rooms');
            }

            await room.destroy();

            req.flash('success_msg', 'Sala excluída com sucesso!');
            return res.redirect('/rooms');
        } catch (err) {
            console.error(err);
            req.flash('error_msg', 'Erro ao excluir sala.');
            return res.redirect('/rooms');
        }
    }
};
