// Browser tests: Vitest with jsdom and React Testing Library. Server tests use node:test (see package.json).
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['tests/web/**/*.test.{js,jsx}'],
    setupFiles: ['tests/web/setup.js'],
    // Whole-screen tests with an accessibility check take a few seconds under a parallel run.
    testTimeout: 15000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{js,jsx}'],
      reporter: ['text-summary', 'lcov'],
      // A floor measured on the day it was set (statements 95.4%, lines 95.7%, functions 93.5%, branches 83.1%), with
      // a margin of a point or two. Untested files count against it because `include` lists every source file; only the
      // two-line entry point (main.jsx) is left out. Raise it as tests are added and never lower it.
      exclude: ['src/main.jsx'],
      thresholds: { lines: 94, statements: 94, functions: 92, branches: 82 },
    },
  },
});
