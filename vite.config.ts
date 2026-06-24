import { defineConfig } from 'vite';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';

export default defineConfig(({ mode }) => {
  const isProduction = mode === 'production';
  const isCJS = mode === 'cjs';
  const isDevelopment = mode === 'development';

  if (isCJS) {
    return {
      build: {
        lib: {
          entry: resolve(__dirname, 'src/index.ts'),
          formats: ['cjs'],
          fileName: (format) => `index.cjs.js`,
        },
        outDir: 'dist/cjs',
        rollupOptions: {
          external: ['@noble/hashes', '@noble/secp256k1', '@scure/bip32', '@scure/bip39', '@scure/base'],
        },
        sourcemap: false,
        emptyOutDir: false,
      },
    };
  }

  return {
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
    },
    plugins: [
      dts({
        include: ['src/**/*.ts'],
        outDir: 'dist/types',
        rollupTypes: true,
      }),
    ],
    build: {
      lib: {
        entry: resolve(__dirname, 'src/index.ts'),
        formats: isProduction ? ['es', 'umd'] : ['es'],
        name: 'GhostPaySDK',
        fileName: (format) => {
          if (format === 'es') return 'index.js';
          if (format === 'cjs') return 'index.cjs.js';
          return 'ghostpay-sdk.js';
        },
      },
      outDir: isProduction ? 'dist/umd' : 'dist/esm',
      rollupOptions: {
        external: isProduction
          ? []
          : ['@noble/hashes', '@noble/secp256k1', '@scure/bip32', '@scure/bip39', '@scure/base'],
        output: {
          globals: {},
          exports: 'named',
        },
      },
      sourcemap: false,
      minify: isProduction ? 'esbuild' : false,
    },
    test: {
      globals: true,
      environment: 'node',
      include: ['tests/**/*.test.ts'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'html'],
        exclude: ['node_modules/', 'tests/'],
      },
    },
  };
});
