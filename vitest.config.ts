import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    plugins: [react() as any],
    test: {
        environment: 'node',
        include: ['**/*.test.ts', '**/*.test.tsx'],
        environmentMatchGlobs: [
            ['client/**/*.test.tsx', 'jsdom'],
            ['client/**/*.test.ts', 'jsdom'],
            ['server/**/*.test.ts', 'node'],
            ['shared/**/*.test.ts', 'node']
        ],
        setupFiles: ['./vitest.setup.ts'],
        alias: {
            '@shared': path.resolve(__dirname, './shared'),
            '@': path.resolve(__dirname, './client/src'),
        },
    } as any,
});
