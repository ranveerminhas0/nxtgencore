import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        environment: 'node',
        include: ['**/*.test.ts'],
        alias: {
            '@shared': path.resolve(__dirname, './shared'),
        },
    },
});
