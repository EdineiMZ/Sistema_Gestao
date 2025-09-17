const multer = require('multer');

const MAX_SIZE = Number.parseInt(process.env.FINANCE_ATTACHMENT_MAX_SIZE, 10) || (10 * 1024 * 1024);
const MAX_FILES = Number.parseInt(process.env.FINANCE_ATTACHMENT_MAX_FILES, 10) || 5;

const ALLOWED_MIME_TYPES = new Set([
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/jpg',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'text/plain',
    'application/zip',
    'application/x-zip-compressed'
]);

const storage = multer.memoryStorage();

const multerInstance = multer({
    storage,
    limits: {
        fileSize: MAX_SIZE,
        files: MAX_FILES
    },
    fileFilter: (req, file, cb) => {
        if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
            cb(null, true);
            return;
        }

        const error = new Error('Tipo de arquivo não suportado para anexos financeiros.');
        error.code = 'UNSUPPORTED_FILE_TYPE';
        cb(error);
    }
});

const uploadAttachments = (req, res, next) => {
    const handler = multerInstance.array('attachments');
    handler(req, res, (err) => {
        if (!err) {
            return next();
        }

        if (typeof req.flash === 'function') {
            if (err.code === 'LIMIT_FILE_SIZE') {
                req.flash('error_msg', 'Anexo excede o tamanho máximo permitido (10MB).');
                return res.redirect('/finance');
            }

            if (err.code === 'LIMIT_FILE_COUNT') {
                req.flash('error_msg', 'Limite de anexos atingido para este lançamento.');
                return res.redirect('/finance');
            }

            if (err.code === 'UNSUPPORTED_FILE_TYPE') {
                req.flash('error_msg', 'Tipo de arquivo não suportado para anexos financeiros.');
                return res.redirect('/finance');
            }
        }

        next(err);
    });
};

module.exports = {
    uploadAttachments,
    multerInstance
};
