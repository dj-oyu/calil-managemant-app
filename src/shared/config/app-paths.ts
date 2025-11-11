import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { resolveAppRoot } from './path-utils';

export const appDirectoryName =
    process.env.CALIL_APP_DIR_NAME ?? 'Calil-management-app';

export const appRoot =
    process.env.CALIL_APP_ROOT ??
    resolveAppRoot({ appDirectoryName });

export const appPaths = {
    root: appRoot,
    cache: path.join(appRoot, 'cache'),
    coverCache: path.join(appRoot, 'cache', 'covers'),
    vaultDir: path.join(appRoot, 'vault'),
    vaultFile: path.join(appRoot, 'vault', 'calil.cookies.json'),
    chromeEndpointFile: path.join(appRoot, 'vault', 'chrome.ws'),
    browserProfile: path.join(appRoot, 'browser-profile'),
    chromiumCache: path.join(appRoot, 'chromium-cache'),
};

export async function ensureDir(directory: string) {
    await mkdir(directory, { recursive: true });
}
