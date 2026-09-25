import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // Node is fine for the pure-logic modules under test (src/utilities.js, src/schema.js, etc).
        // Switch to 'jsdom' here if/when DOM-dependent code (e.g. main.js) needs coverage.
        environment: 'node',
        include: ['test/**/*.test.js', 'src/**/*.test.js'],
        // Source files are plain ES modules (export/import) with no TS/Flow syntax, so
        // vitest's native esbuild-based transform handles them without any babel config.
    }
});
