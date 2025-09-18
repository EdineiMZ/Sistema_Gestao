// src/controllers/campaignController.js
const {
    CAMPAIGN_STATUS_LABELS,
    createCampaign,
    queueCampaignById,
    dispatchCampaignById,
    dispatchPendingCampaigns,
    listCampaigns
} = require('../services/campaignService');
const { ROLE_LABELS, ROLE_ORDER } = require('../constants/roles');

const safeParseJson = (value) => {
    if (!value) return null;
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch (error) {
        return null;
    }
};

const buildRoleOptions = () => {
    return ROLE_ORDER.map((role) => ({
        value: role,
        label: ROLE_LABELS[role] || role
    }));
};

const buildStatusOptions = () => Object.entries(CAMPAIGN_STATUS_LABELS).map(([value, label]) => ({ value, label }));

module.exports = {
    showCreate: (req, res) => {
        const formData = safeParseJson(req.flash('campaign_form')[0]) || {};
        res.render('campaigns/create', {
            pageTitle: 'Nova campanha',
            roleOptions: buildRoleOptions(),
            statusOptions: buildStatusOptions(),
            formData
        });
    },

    createCampaign: async (req, res) => {
        const {
            title,
            message,
            messageHtml,
            previewText,
            accentColor,
            segmentFilters,
            scheduledAt,
            action
        } = req.body;

        const payload = {
            title,
            message,
            messageHtml,
            previewText,
            accentColor,
            segmentFilters,
            scheduledAt
        };

        try {
            const campaign = await createCampaign(payload, {
                actorId: req.user?.id,
                ip: req.ip
            });

            if (action === 'queue' || action === 'dispatch') {
                await queueCampaignById(campaign.id, {
                    scheduledAt,
                    actorId: req.user?.id,
                    ip: req.ip
                });
            }

            if (action === 'dispatch') {
                await dispatchCampaignById(campaign.id, {
                    actorId: req.user?.id,
                    ip: req.ip
                });
                req.flash('success_msg', 'Campanha criada e enviada com sucesso.');
            } else if (action === 'queue') {
                req.flash('success_msg', 'Campanha criada e adicionada à fila.');
            } else {
                req.flash('success_msg', 'Campanha salva como rascunho.');
            }

            return res.redirect('/campaigns');
        } catch (error) {
            console.error('Erro ao criar campanha:', error);
            req.flash('error_msg', error.message || 'Erro ao criar campanha.');
            req.flash('campaign_form', JSON.stringify(payload));
            return res.redirect('/campaigns/create');
        }
    },

    listCampaigns: async (req, res) => {
        try {
            const { campaigns, filters } = await listCampaigns(req.query);
            res.render('campaigns/manage', {
                pageTitle: 'Campanhas de marketing',
                campaigns,
                filters,
                statusOptions: buildStatusOptions()
            });
        } catch (error) {
            console.error('Erro ao listar campanhas:', error);
            req.flash('error_msg', 'Erro ao listar campanhas.');
            return res.redirect('/');
        }
    },

    queueCampaign: async (req, res) => {
        const { id } = req.params;
        const { scheduledAt, dispatchNow } = req.body;
        try {
            await queueCampaignById(id, {
                scheduledAt,
                actorId: req.user?.id,
                ip: req.ip
            });

            if (dispatchNow === 'true') {
                await dispatchCampaignById(id, {
                    actorId: req.user?.id,
                    ip: req.ip
                });
                req.flash('success_msg', 'Campanha enviada com sucesso.');
            } else {
                req.flash('success_msg', 'Campanha adicionada à fila.');
            }
        } catch (error) {
            console.error('Erro ao enfileirar campanha:', error);
            req.flash('error_msg', error.message || 'Erro ao enfileirar campanha.');
        }

        return res.redirect('/campaigns');
    },

    dispatchCampaign: async (req, res) => {
        const { id } = req.params;
        try {
            await dispatchCampaignById(id, {
                actorId: req.user?.id,
                ip: req.ip
            });
            req.flash('success_msg', 'Campanha enviada com sucesso.');
        } catch (error) {
            console.error('Erro ao enviar campanha:', error);
            req.flash('error_msg', error.message || 'Erro ao enviar campanha.');
        }

        return res.redirect('/campaigns');
    },

    dispatchPending: async (req, res) => {
        try {
            const results = await dispatchPendingCampaigns({
                actorId: req.user?.id,
                ip: req.ip
            });

            const sentCount = results.filter((item) => item.status === 'sent').length;
            const failedCount = results.filter((item) => item.status === 'failed').length;

            if (sentCount) {
                req.flash('success_msg', `${sentCount} campanha(s) despachada(s) com sucesso.`);
            }
            if (failedCount) {
                req.flash('error_msg', `${failedCount} campanha(s) falharam ao despachar.`);
            }
        } catch (error) {
            console.error('Erro ao processar campanhas pendentes:', error);
            req.flash('error_msg', 'Erro ao processar campanhas pendentes.');
        }

        return res.redirect('/campaigns');
    }
};
