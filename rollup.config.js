import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import { terser } from '@rollup/plugin-terser';
import path from 'path';
import fs from 'fs';

export default {
  input: 'dist/src/index.js',
  output: [
    {
      file: 'dist-bundle/index.js',
      format: 'esm',
      sourcemap: true,
      banner: '// 🚀 MemoriAI - ES Module Bundle\n',
    },
    {
      file: 'dist-bundle/index.cjs',
      format: 'cjs',
      sourcemap: true,
      banner: '// 🚀 MemoriAI - CommonJS Bundle\n',
    },
  ],
  plugins: [
    resolve({
      browser: false,
      extensions: ['.js'],
      alias: {
        entries: [
          {
            find: /^@\/(.*)$/,
            replacement: path.resolve(process.cwd(), 'src', '$1'),
          },
        ],
      },
    }),
    commonjs({
      ignoreGlobal: true,
      transformMixedEsModules: true,
    }),
    ...(process.env.NODE_ENV === 'production' ? [terser({
      compress: {
        drop_console: false,
        drop_debugger: true,
      },
      mangle: {
        keep_fnames: true,
      },
      format: {
        comments: false,
      },
    })] : []),
    // Custom plugin to copy CLI file
    {
      name: 'copy-cli',
      writeBundle() {
        // Copy CLI file to dist-bundle directory
        const cliSource = 'dist/src/cli/init-db.js';
        const cliDest = 'dist-bundle/init-db.js';
        if (fs.existsSync(cliSource)) {
          fs.copyFileSync(cliSource, cliDest);
          // Make it executable
          fs.chmodSync(cliDest, '755');
          console.log('CLI copied to dist-bundle/init-db.js');
        }
      }
    }
  ],
  external: [
    'crypto', 'util', 'stream', 'events', 'os', 'path', 'url', 'querystring', 'buffer', 'process',
    '@prisma/client', 'openai', '@anthropic-ai/sdk', 'uuid', 'winston', 'zod', 'module'
  ],
  treeshake: {
    moduleSideEffects: false,
    propertyReadSideEffects: false,
    tryCatchDeoptimization: false,
  },
  onwarn(warning, warn) {
    if (warning.code === 'THIS_IS_UNDEFINED' || warning.code === 'CIRCULAR_DEPENDENCY') {
      return;
    }
    warn(warning);
  },
};