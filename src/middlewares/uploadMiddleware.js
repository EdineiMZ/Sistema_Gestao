// src/middlewares/uploadMiddleware.js

const multer = require('multer');
const path = require('path');

// Limite real de 5MB para uploads de imagem
const MAX_SIZE = 5 * 1024 * 1024;

// Configuração na memória (buffer) - pois vamos salvar no DB
const storage = multer.memoryStorage();

const upload = multer({
    storage,
    limits: { fileSize: MAX_SIZE },
    fileFilter: (req, file, cb) => {
        // Exemplo simples: aceita apenas imagens png, jpg, jpeg
        const allowedMimes = ['image/jpeg', 'image/png', 'image/jpg'];
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
            return;
        }
        cb(new Error('Tipo de arquivo inválido. Envie uma imagem PNG ou JPEG.'));
    }
});

module.exports = upload;
