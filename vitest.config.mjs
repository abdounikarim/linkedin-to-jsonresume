import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // `src/main.js` assigns to `window.LinkedinToResumeJson` and touches `document`
        // at module scope / construction time, so a DOM environment is required for the
        // whole suite (not just main.test.js) to be able to import it safely.
        environment: 'jsdom',
        include: ['src/**/*.test.js', 'test/**/*.test.js'],
        coverage: {
            provider: 'v8',
            include: ['src/**/*.js'],
            exclude: ['src/**/*.test.js']
        }
    }
});
