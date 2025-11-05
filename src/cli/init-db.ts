#!/usr/bin/env node
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

interface InitDbOptions {
  schemaPath: string;
  url?: string;
  helpRequested?: boolean;
}

const DEFAULT_COMMAND = 'init-db';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveDefaultSchema(): string {
  // Try multiple locations for the schema file
  const candidates = [
    path.resolve(__dirname, '../../../prisma/schema.prisma'), // npm package
    path.resolve(__dirname, '../../prisma/schema.prisma'),    // local dev
    path.resolve(process.cwd(), 'node_modules/memorits/prisma/schema.prisma'), // installed package
    path.resolve(process.cwd(), 'prisma/schema.prisma'),      // current directory
  ];
  
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  
  throw new Error(`Unable to locate Prisma schema. Tried:\n${candidates.join('\n')}`);
}

function parseArgs(argv: string[]): { command?: string; options: InitDbOptions } {
  const args = [...argv];
  const options: InitDbOptions = {
    schemaPath: resolveDefaultSchema(),
  };

  while (args.length > 0) {
    const raw = args.shift() as string;

    if (raw === '--help' || raw === '-h') {
      options.helpRequested = true;
      continue;
    }

    if (raw.startsWith('--schema=')) {
      options.schemaPath = path.resolve(process.cwd(), raw.split('=')[1]);
      continue;
    }
    if (raw === '--schema') {
      const value = args.shift();
      if (!value) {
        throw new Error('Missing value for --schema option.');
      }
      options.schemaPath = path.resolve(process.cwd(), value);
      continue;
    }

    if (raw.startsWith('--url=')) {
      options.url = raw.split('=')[1];
      continue;
    }
    if (raw === '--url') {
      const value = args.shift();
      if (!value) {
        throw new Error('Missing value for --url option.');
      }
      options.url = value;
      continue;
    }

    throw new Error(`Unrecognized option: ${raw}`);
  }

  return { options };
}

function printGeneralHelp(): void {
  const schemaPath = resolveDefaultSchema();
  const lines = [
    'memorits - MemoriTS CLI',
    '',
    'Usage:',
    '  memorits init-db [--url file:./memori.db] [--schema <path>]',
    '',
    'Options:',
    '  --url <connection>     Database connection URL (defaults to DATABASE_URL or MEMORI_DATABASE_URL).',
    `  --schema <path>        Path to Prisma schema file (default: ${schemaPath}).`,
    '  -h, --help             Show this message.',
  ];
  console.log(lines.join('\n'));
}

async function requirePrismaCli(): Promise<string> {
  try {
    // Dynamic import for ES module compatibility
    const { createRequire } = await import('module');
    const require = createRequire(import.meta.url);
    return require.resolve('prisma/build/index.js');
  } catch (error) {
    throw new Error(
      'Unable to resolve Prisma CLI. Ensure the "prisma" package is installed as a dependency.',
    );
  }
}

async function run(): Promise<void> {
  // Skip the first two args (node and script path)
  const args = process.argv.slice(2);
  
  // If no arguments or help flag, show help
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printGeneralHelp();
    process.exit(0);
  }

  // Check if first argument is a command
  let commandArgs = args;
  if (args[0] === DEFAULT_COMMAND || args[0] === 'init-db') {
    // Skip the command name, the rest are options
    commandArgs = args.slice(1);
  }
  // If no command but we have options, treat as direct options

  let parsed;
  try {
    parsed = parseArgs(commandArgs);
  } catch (error) {
    console.error((error as Error).message);
    process.exit(1);
    return;
  }

  if (parsed.options.helpRequested) {
    printGeneralHelp();
    process.exit(0);
    return;
  }

  const schemaPath = parsed.options.schemaPath;
  if (!fs.existsSync(schemaPath)) {
    console.error(`Schema file not found at ${schemaPath}`);
    process.exit(1);
    return;
  }

  const prismaCli = await requirePrismaCli();

  const prismaArgs = [prismaCli, 'db', 'push', '--schema', schemaPath];
  const databaseUrl = parsed.options.url ?? process.env.DATABASE_URL ?? process.env.MEMORI_DATABASE_URL;
  
  const childEnv = {
    ...process.env,
  };
  
  if (databaseUrl) {
    childEnv.DATABASE_URL = databaseUrl;
  } else {
    console.warn(
      'No database URL provided. Pass --url file:./memori.db or set DATABASE_URL / MEMORI_DATABASE_URL.',
    );
  }

  const child = spawn(process.execPath, prismaArgs, {
    stdio: 'inherit',
    env: childEnv,
  });

  child.on('exit', code => {
    process.exit(code ?? 0);
  });
  child.on('error', error => {
    console.error('Failed to execute Prisma CLI:', error);
    process.exit(1);
  });
}

run().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
