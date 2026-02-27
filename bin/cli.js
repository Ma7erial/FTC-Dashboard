#!/usr/bin/env node

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

async function run() {
  const envPath = path.join(process.cwd(), '.env');

  if (!fs.existsSync(envPath)) {
    console.log('Environment configuration not found in current directory. Starting setup...');
    const setupProcess = spawn('npx', ['tsx', path.join(projectRoot, 'setup.ts')], {
      stdio: 'inherit',
      cwd: process.cwd(),
    });

    setupProcess.on('close', (code) => {
      if (code === 0) {
        startServer();
      } else {
        process.exit(code || 1);
      }
    });
  } else {
    startServer();
  }
}

function startServer() {
  const serverProcess = spawn('npx', ['tsx', path.join(projectRoot, 'server.ts')], {
    stdio: 'inherit',
    cwd: projectRoot, // Run from project root so node_modules are found
  });

  serverProcess.on('close', (code) => {
    process.exit(code || 0);
  });
}

run().catch(console.error);
