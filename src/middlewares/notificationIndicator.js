const { Notification } = require('../../database/models');
const { Op } = require('sequelize');

const MAX_BADGE_ITEMS = 8;

const buildPreview = (notification) => {
    const source = notification.previewText || notification.message || '';
    const trimmed = source.trim();
    if (!trimmed) {
        return '';
    }
    return trimmed.length > 90 ? `${trimmed.slice(0, 87)}...` : trimmed;
};

module.exports = async function notificationIndicator(req, res, next) {
    try {
        if (!req.user || req.method !== 'GET') {
            return next();
        }

        const acceptHeader = req.headers.accept || '';
        if (acceptHeader && !acceptHeader.includes('text/html')) {
            return next();
        }

        const now = new Date();
        const where = {
            active: true,
            sent: false,
            [Op.and]: [
                {
                    [Op.or]: [
                        { triggerDate: null },
                        { triggerDate: { [Op.lte]: now } }
                    ]
                },
                {
                    [Op.or]: [
                        { sendToAll: true },
                        { userId: req.user.id }
                    ]
                }
            ]
        };

        const attributes = ['id', 'title', 'previewText', 'message', 'accentColor'];

        const notifications = await Notification.findAll({
            where,
            attributes,
            order: [['updatedAt', 'DESC']],
            limit: MAX_BADGE_ITEMS
        });

        if (notifications.length) {
            const sanitized = notifications.map((notif) => {
                const plain = notif.get({ plain: true });
                return {
                    id: plain.id,
                    title: plain.title,
                    preview: buildPreview(plain),
                    accentColor: plain.accentColor
                };
            });

            res.locals.notifications = sanitized;
        }
    } catch (error) {
        console.error('Erro ao carregar indicador de notificações:', error);
    }

    return next();
};
