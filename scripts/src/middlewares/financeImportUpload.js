const multer = require('multer');
const path = require('path');

const MAX_SIZE = 2 * 1024 * 1024; // 2MB

const storage = multer.memoryStorage();

const allowedExtensions = new Set(['.csv', '.ofx']);
const allowedMimes = new Set([
    'text/csv',
    'application/vnd.ms-excel',
    'application/octet-stream',
    'text/plain',
    'application/ofx',
    'application/x-ofx'
]);

const financeImportUpload = multer({
    storage,
    limits: { fileSize: MAX_SIZE },
    fileFilter: (req, file, cb) => {
        const extension = path.extname(file.originalname || '').toLowerCase();
        if (allowedExtensions.has(extension) || allowedMimes.has(file.mimetype)) {
            cb(null, true);
            return;
        }
        cb(new Error('Formato de arquivo não suportado. Envie um arquivo CSV ou OFX.'));
    }
});

module.exports = financeImportUpload;
