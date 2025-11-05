#!/usr/bin/env bun

/**
 * Build script for compiling binaries with versioned filenames
 *
 * This script:
 * 1. Runs prebuild to bundle assets
 * 2. Reads version from package.json or VERSION env var
 * 3. Compiles binaries with version in filename
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { $ } from 'bun';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const distDir = resolve(rootDir, 'dist');

// Read package.json to get version
const packageJsonPath = resolve(rootDir, 'package.json');
const packageJson = await Bun.file(packageJsonPath).json();

// Get version from env var or package.json
const version = process.env.VERSION || packageJson.version || 'dev';

console.log(`🏗️  Building binaries version: ${version}`);

// Create dist directory
mkdirSync(distDir, { recursive: true });

// Run prebuild to bundle assets
console.log('📦 Running prebuild (bundling assets)...');
await $`bun run prebuild`;

// Define build targets
const targets = [
    {
        name: 'Linux x64',
        target: 'bun-linux-x64',
        filename: `Calil-management-app-${version}-linux-x64`,
    },
    {
        name: 'Windows x64',
        target: 'bun-windows-x64',
        filename: `Calil-management-app-${version}-win-x64.exe`,
    },
    {
        name: 'macOS x64',
        target: 'bun-darwin-x64',
        filename: `Calil-management-app-${version}-macos-x64`,
    },
    {
        name: 'macOS ARM64',
        target: 'bun-darwin-arm64',
        filename: `Calil-management-app-${version}-macos-arm64`,
    },
];

// Build each target
for (const { name, target, filename } of targets) {
    console.log(`\n🔨 Building ${name}...`);
    const outfile = resolve(distDir, filename);

    try {
        await $`NODE_ENV=production bun build index.tsx --compile --target ${target} --outfile ${outfile}`;
        console.log(`✅ ${name} built successfully: ${filename}`);
    } catch (error) {
        console.error(`❌ Failed to build ${name}:`, error);
        process.exit(1);
    }
}

console.log('\n✨ All binaries built successfully!');
console.log(`\nOutput directory: ${distDir}`);
console.log('Files:');
targets.forEach(({ filename }) => {
    console.log(`  - ${filename}`);
});
