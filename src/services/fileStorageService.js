const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_STORAGE_ROOT = process.env.FINANCE_STORAGE_PATH
    ? path.resolve(process.env.FINANCE_STORAGE_PATH)
    : path.resolve(process.cwd(), 'storage', 'finance');

const DIRECTORY_MODE = 0o750;
const FILE_MODE = 0o640;

const ensureDirectory = async (target) => {
    await fsp.mkdir(target, { recursive: true, mode: DIRECTORY_MODE });
};

const normalizeStorageKey = (storageKey) => {
    if (!storageKey) {
        throw new Error('Storage key inválido.');
    }
    const normalized = storageKey.replace(/\\/g, '/').replace(/^\/+/, '');
    if (!normalized) {
        throw new Error('Storage key inválido.');
    }
    return normalized;
};

const resolveStoragePath = (storageKey) => {
    const normalizedKey = normalizeStorageKey(storageKey);
    const fullPath = path.resolve(DEFAULT_STORAGE_ROOT, normalizedKey);
    if (!fullPath.startsWith(DEFAULT_STORAGE_ROOT)) {
        throw new Error('Tentativa de acesso fora do diretório de armazenamento.');
    }
    return fullPath;
};

const sanitizeFileName = (name) => {
    if (!name) {
        return 'anexo';
    }

    const base = path.basename(String(name));
    const cleaned = base.replace(/[^\w\d._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

    if (!cleaned) {
        return 'anexo';
    }

    return cleaned.slice(0, 255);
};

const generateStorageKey = (originalName) => {
    const safeName = sanitizeFileName(originalName);
    const extension = path.extname(safeName);
    const randomBytes = crypto.randomBytes(16).toString('hex');
    const folder = randomBytes.slice(0, 2);
    const timestamp = Date.now();
    const finalName = `${timestamp}-${randomBytes}${extension}`;
    return path.join(folder, finalName).replace(/\\/g, '/');
};

const computeChecksum = (buffer) => {
    return crypto.createHash('sha256').update(buffer).digest('hex');
};

const saveBuffer = async ({ buffer, originalName }) => {
    if (!Buffer.isBuffer(buffer)) {
        throw new Error('Buffer inválido para armazenamento.');
    }

    await ensureDirectory(DEFAULT_STORAGE_ROOT);

    const storageKey = generateStorageKey(originalName);
    const absolutePath = resolveStoragePath(storageKey);
    await ensureDirectory(path.dirname(absolutePath));

    await fsp.writeFile(absolutePath, buffer, { mode: FILE_MODE, flag: 'w' });

    const checksum = computeChecksum(buffer);

    return {
        storageKey,
        checksum,
        sanitizedFileName: sanitizeFileName(originalName)
    };
};

const deleteStoredFile = async (storageKey) => {
    try {
        const absolutePath = resolveStoragePath(storageKey);
        await fsp.unlink(absolutePath);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return;
        }
        throw error;
    }
};

const createReadStream = (storageKey) => {
    const absolutePath = resolveStoragePath(storageKey);
    return fs.createReadStream(absolutePath);
};

module.exports = {
    getStorageRoot: () => DEFAULT_STORAGE_ROOT,
    saveBuffer,
    deleteStoredFile,
    createReadStream,
    resolveStoragePath,
    sanitizeFileName
};
