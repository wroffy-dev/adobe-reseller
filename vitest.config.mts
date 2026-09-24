import { defineConfig } from 'vitest/config';
import path from 'node:path';
import react from '@vitejs/plugin-react';

const root = import.meta.dirname;

export default defineConfig({
  // Next.js keeps JSX as-is (`jsx: preserve`), so a test that imports a
  // component needs its own transform.
  plugins: [react()],
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    // Integration tests share one database; run files sequentially.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(root, './src'),
      // `server-only` throws when imported outside a React Server Component;
      // tests exercise those modules directly, so stub it out.
      'server-only': path.resolve(root, './tests/stubs/server-only.ts'),
    },
  },
});
