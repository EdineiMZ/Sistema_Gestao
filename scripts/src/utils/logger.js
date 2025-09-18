const LEVELS = ['error', 'warn', 'info', 'debug'];

const defaultSilent = process.env.NODE_ENV === 'test';
const forceSilent = process.env.LOGGER_SILENT === 'true';
const forceVerbose = process.env.LOGGER_SILENT === 'false';

const shouldSilent = forceVerbose ? false : forceSilent || defaultSilent;

function emit(level, args) {
    if (shouldSilent) {
        return;
    }

    const consoleMethod = typeof console[level] === 'function' ? console[level] : console.log;
    const timestamp = new Date().toISOString();

    // Utiliza formatação consistente para facilitar auditoria de logs.
    consoleMethod(`[${timestamp}] [${level.toUpperCase()}]`, ...args);
}

const logger = LEVELS.reduce((acc, level) => {
    acc[level] = (...args) => emit(level, args);
    return acc;
}, {});

module.exports = Object.freeze(logger);
