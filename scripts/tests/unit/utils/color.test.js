const { generateRandomHexColor } = require('../../../src/utils/color');

describe('generateRandomHexColor', () => {
    it('should return a hex color string with # prefix and 6 hex digits', () => {
        const color = generateRandomHexColor();
        expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
    });

    it('should produce different values over multiple calls', () => {
        const iterations = 10;
        const results = new Set();
        for (let i = 0; i < iterations; i += 1) {
            results.add(generateRandomHexColor());
        }
        expect(results.size).toBeGreaterThan(1);
    });
});
