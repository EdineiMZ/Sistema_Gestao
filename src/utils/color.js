// src/utils/color.js

/**
 * Generates a random hex color string in the format #RRGGBB.
 * Uses a 24-bit integer to ensure consistent length and coverage.
 * @returns {string} Hex color string prefixed with '#'.
 */
function generateRandomHexColor() {
    const randomInt = Math.floor(Math.random() * 0x1000000); // 24-bit integer
    return `#${randomInt.toString(16).padStart(6, '0')}`;
}

module.exports = {
    generateRandomHexColor
};
