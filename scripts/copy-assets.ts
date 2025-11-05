#!/usr/bin/env bun

/**
 * Build script to copy assets alongside compiled binaries
 *
 * This script copies CSS files and client TypeScript files to the dist directory
 * so they can be loaded by the compiled binary at runtime.
 */

import { mkdirSync, cpSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const distDir = resolve(rootDir, 'dist');

console.log('📦 Copying assets to dist directory...');

// Create dist directory if it doesn't exist
mkdirSync(distDir, { recursive: true });

// Copy styles directory
const stylesSource = resolve(rootDir, 'src/app/styles');
const stylesDest = resolve(distDir, 'styles');
console.log(`  Copying styles: ${stylesSource} → ${stylesDest}`);
cpSync(stylesSource, stylesDest, { recursive: true });

// Copy client directory
const clientSource = resolve(rootDir, 'client');
const clientDest = resolve(distDir, 'client');
console.log(`  Copying client: ${clientSource} → ${clientDest}`);
cpSync(clientSource, clientDest, { recursive: true });

console.log('✅ Assets copied successfully!');
console.log(`
Distribution structure:
  dist/
    ├── Calil-management-app-*    (binaries)
    ├── styles/                    (CSS files)
    └── client/                    (TypeScript files)
`);
