// src/controllers/appointmentController.js
const { Appointment, User, Room, Procedure } = require('../../database/models');
const { Op } = require('sequelize');
const { buildQueryFilters } = require('../utils/queryBuilder');
const { generateRandomHexColor } = require('../utils/color');
const { USER_ROLES } = require('../constants/roles');

const PROFESSIONAL_ROLES = [
    USER_ROLES.SPECIALIST,
    USER_ROLES.MANAGER,
    USER_ROLES.ADMIN
];


module.exports = {
    // Lista agendamentos
    listAppointments: async (req, res) => {
        try {
            const normalizedQuery = {
                ...req.query,
                keyword: req.query.keyword || req.query.search
            };

            const { where, filters, metadata } = buildQueryFilters(normalizedQuery, {
                statusField: 'status',
                statusMap: {
                    scheduled: 'scheduled',
                    completed: 'completed',
                    cancelled: 'cancelled',
                    'no-show': 'no-show',
                    'pending-confirmation': 'pending-confirmation'
                },
                allowedStatuses: ['scheduled', 'completed', 'cancelled', 'no-show', 'pending-confirmation'],
                dateField: 'start',
                keywordFields: ['description', 'clientEmail']
            });

            if (metadata.keywordNumeric !== null) {
                metadata.orConditions.push({ id: metadata.keywordNumeric });
            }

            if (metadata.orConditions.length) {
                where[Op.or] = metadata.orConditions;
            }

            const appointments = await Appointment.findAll({
                where,
                include: [
                    { model: User, as: 'professional' },
                    { model: Room, as: 'room' },
                    { model: Procedure, as: 'procedure' }
                ]
            });

            res.render('appointments/manageAppointments', { appointments, filters });
        } catch (err) {
            console.error(err);
            req.flash('error_msg', 'Erro ao listar agendamentos.');
            return res.redirect('/');
        }
    },

    // Form de criação
    showCreate: async (req, res) => {
        try {
            // Filtra usuários com perfil profissional
            const professionals = await User.findAll({
                where: { role: { [Op.in]: PROFESSIONAL_ROLES } }
            });
            const rooms = await Room.findAll({ where: { active: true } });
            const procedures = await Procedure.findAll({ where: { active: true } });

            res.render('appointments/createAppointment', {
                professionals,
                rooms,
                procedures
            });
        } catch (err) {
            console.error(err);
            req.flash('error_msg', 'Erro ao exibir form.');
            return res.redirect('/appointments');
        }
    },

    createAppointment: async (req, res) => {
        try {
            const {
                description,
                professionalId,
                clientEmail,
                roomId,
                procedureId,
                start,
                end,
                paymentConfirmed
            } = req.body;

            // Carrega procedure p/ ver se exige sala
            const procedure = await Procedure.findByPk(procedureId);
            let finalRoomId = roomId || null;

            if (procedure && procedure.requiresRoom && !roomId) {
                req.flash('error_msg', 'Procedimento exige sala, mas nenhuma selecionada.');
                return res.redirect('/appointments/create');
            }

            // Checa sobreposição
            if (finalRoomId) {
                const overlap = await Appointment.findOne({
                    where: {
                        roomId: finalRoomId,
                        start: { [Op.lt]: end },
                        end: { [Op.gt]: start }
                    }
                });
                if (overlap) {
                    req.flash('error_msg', 'Sala já reservada nesse horário.');
                    return res.redirect('/appointments/create');
                }
            }

            await Appointment.create({
                description,
                professionalId,
                clientEmail,
                roomId: finalRoomId,
                procedureId,
                start,
                end,
                status: 'scheduled',
                paymentConfirmed: (paymentConfirmed === 'true')
            });

            // Se quiser enviar email p/ clientEmail
            // ex: notificarCliente(clientEmail, ...);

            req.flash('success_msg', 'Agendamento criado com sucesso!');
            res.redirect('/appointments');
        } catch (err) {
            console.error(err);
            req.flash('error_msg', 'Erro ao criar agendamento.');
            res.redirect('/appointments');
        }
    },

    // Edição
    showEdit: async (req, res) => {
        try {
            const { id } = req.params;
            const appointment = await Appointment.findByPk(id, {
                include: [
                    { model: User, as: 'professional' },
                    { model: Room, as: 'room' },
                    { model: Procedure, as: 'procedure' }
                ]
            });
            if (!appointment) {
                req.flash('error_msg', 'Agendamento não encontrado.');
                return res.redirect('/appointments');
            }

            const professionals = await User.findAll({ where: { role: { [Op.in]: PROFESSIONAL_ROLES } } });
            const rooms = await Room.findAll({ where: { active: true } });
            const procedures = await Procedure.findAll({ where: { active: true } });

            res.render('appointments/editAppointment', {
                appointment,
                professionals,
                rooms,
                procedures
            });
        } catch (err) {
            console.error(err);
            req.flash('error_msg', 'Erro ao exibir edição.');
            res.redirect('/appointments');
        }
    },

    updateAppointment: async (req, res) => {
        try {
            const { id } = req.params;
            const {
                description,
                professionalId,
                clientEmail,
                roomId,
                procedureId,
                start,
                end,
                status,
                paymentConfirmed
            } = req.body;

            const appointment = await Appointment.findByPk(id);
            if (!appointment) {
                req.flash('error_msg', 'Agendamento não encontrado.');
                return res.redirect('/appointments');
            }

            const pickLastValue = value => Array.isArray(value) ? value[value.length - 1] : value;
            const normalizeBoolean = (value, fallback) => {
                if (value === undefined) {
                    return fallback;
                }
                const rawValue = pickLastValue(value);
                if (typeof rawValue === 'boolean') {
                    return rawValue;
                }
                if (typeof rawValue === 'string') {
                    const lowered = rawValue.toLowerCase();
                    if (['true', '1', 'on', 'yes'].includes(lowered)) {
                        return true;
                    }
                    if (['false', '0', 'off', 'no'].includes(lowered)) {
                        return false;
                    }
                }
                return fallback;
            };
            const normalizeDate = (value, fallback) => {
                if (value === undefined) {
                    return fallback;
                }
                if (value instanceof Date) {
                    return value;
                }
                const parsed = new Date(value);
                return Number.isNaN(parsed.getTime()) ? fallback : parsed;
            };

            const normalizedDescription = description !== undefined ? description : appointment.description;
            const normalizedProfessionalId = (professionalId !== undefined && professionalId !== '') ? professionalId : appointment.professionalId;
            const normalizedClientEmail = clientEmail !== undefined ? clientEmail : appointment.clientEmail;
            const normalizedRoomId = (() => {
                if (roomId === undefined) {
                    return appointment.roomId;
                }
                if (roomId === '' || roomId === null) {
                    return null;
                }
                return roomId;
            })();
            const normalizedProcedureId = (() => {
                if (procedureId === undefined) {
                    return appointment.procedureId;
                }
                if (procedureId === '' || procedureId === null) {
                    return null;
                }
                return procedureId;
            })();
            const normalizedStart = normalizeDate(start, appointment.start);
            const normalizedEnd = normalizeDate(end, appointment.end);
            const normalizedStatus = (status !== undefined && status !== '') ? status : appointment.status;
            const normalizedPaymentConfirmed = normalizeBoolean(paymentConfirmed, appointment.paymentConfirmed);

            const procedure = normalizedProcedureId != null ? await Procedure.findByPk(normalizedProcedureId) : null;
            if (procedure && procedure.requiresRoom && !normalizedRoomId) {
                req.flash('error_msg', 'Procedimento exige sala, mas nenhuma selecionada.');
                return res.redirect(`/appointments/edit/${id}`);
            }

            if (normalizedRoomId) {
                const overlap = await Appointment.findOne({
                    where: {
                        id: { [Op.ne]: id },
                        roomId: normalizedRoomId,
                        start: { [Op.lt]: normalizedEnd },
                        end: { [Op.gt]: normalizedStart }
                    }
                });
                if (overlap) {
                    req.flash('error_msg', 'Sala já reservada no horário.');
                    return res.redirect(`/appointments/edit/${id}`);
                }
            }

            appointment.description = normalizedDescription;
            appointment.professionalId = normalizedProfessionalId;
            appointment.clientEmail = normalizedClientEmail;
            appointment.roomId = normalizedRoomId;
            appointment.procedureId = normalizedProcedureId;
            appointment.start = normalizedStart;
            appointment.end = normalizedEnd;
            appointment.status = normalizedStatus || appointment.status || 'scheduled';
            appointment.paymentConfirmed = normalizedPaymentConfirmed;

            await appointment.save();
            req.flash('success_msg', 'Agendamento atualizado com sucesso!');
            res.redirect('/appointments');
        } catch (err) {
            console.error(err);
            req.flash('error_msg', 'Erro ao atualizar agendamento.');
            res.redirect('/appointments');
        }
    },

    deleteAppointment: async (req, res) => {
        try {
            const { id } = req.params;
            const appointment = await Appointment.findByPk(id);
            if (!appointment) {
                req.flash('error_msg', 'Agendamento não encontrado.');
                return res.redirect('/appointments');
            }
            await appointment.destroy();
            req.flash('success_msg', 'Agendamento removido com sucesso!');
            res.redirect('/appointments');
        } catch (err) {
            console.error(err);
            req.flash('error_msg', 'Erro ao excluir agendamento.');
            res.redirect('/appointments');
        }
    },

    // Exemplo de Calendário gigante
    showCalendar: async (req, res) => {
        try {
            res.render('appointments/bigCalendar');
        } catch (err) {
            console.error(err);
            req.flash('error_msg', 'Erro ao exibir calendário.');
            res.redirect('/appointments');
        }
    },

    apiEvents: async (req, res) => {
        try {
            const appointments = await Appointment.findAll({
                include: [{ model: User, as: 'professional' }]
            });
            const events = appointments.map(app => {
                return {
                    id: app.id,
                    title: app.description || 'Agendamento',
                    start: app.start,
                    end: app.end,
                    backgroundColor: generateRandomHexColor(),
                    extendedProps: {
                        profissional: app.professional ? app.professional.name : '',
                        paymentConfirmed: app.paymentConfirmed
                    }
                };
            });
            res.json(events);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Erro ao carregar eventos' });
        }
    }
};
