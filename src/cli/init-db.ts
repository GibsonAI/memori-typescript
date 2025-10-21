#!/usr/bin/env node
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

interface InitDbOptions {
  schemaPath: string;
  url?: string;
  helpRequested?: boolean;
}

const DEFAULT_COMMAND = 'init-db';

function resolveDefaultSchema(): string {
  const candidate = path.resolve(__dirname, '../../prisma/schema.prisma');
  if (fs.existsSync(candidate)) {
    return candidate;
  }
  throw new Error(`Unable to locate Prisma schema at expected path: ${candidate}`);
}

function parseArgs(argv: string[]): { command?: string; options: InitDbOptions } {
  const args = [...argv];
  const command = args.shift();
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

  return { command, options };
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

function requirePrismaCli(): string {
  try {
    return require.resolve('prisma/build/index.js');
  } catch (error) {
    throw new Error(
      'Unable to resolve Prisma CLI. Ensure the "prisma" package is installed as a dependency.',
    );
  }
}

async function run(): Promise<void> {
  const [, , maybeCommand, ...rest] = process.argv;

  if (!maybeCommand || maybeCommand === '--help' || maybeCommand === '-h') {
    printGeneralHelp();
    process.exit(0);
  }

  if (maybeCommand !== DEFAULT_COMMAND) {
    console.error(`Unknown command "${maybeCommand}".`);
    printGeneralHelp();
    process.exit(1);
  }

  let parsed;
  try {
    parsed = parseArgs(rest);
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

  const prismaCli = requirePrismaCli();

  const args = [prismaCli, 'db', 'push', '--schema', schemaPath];
  const databaseUrl = parsed.options.url ?? process.env.DATABASE_URL ?? process.env.MEMORI_DATABASE_URL;
  if (databaseUrl) {
    args.push('--url', databaseUrl);
  } else {
    console.warn(
      'No database URL provided. Pass --url file:./memori.db or set DATABASE_URL / MEMORI_DATABASE_URL.',
    );
  }

  const child = spawn(process.execPath, args, {
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl ?? process.env.DATABASE_URL,
    },
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
