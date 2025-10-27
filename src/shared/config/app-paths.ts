import os from 'node:os';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';

export const appDirectoryName =
    process.env.CALIL_APP_DIR_NAME ?? 'Calil-management-app';

export const appRoot =
    process.env.CALIL_APP_ROOT ??
    (() => {
        if (process.platform === 'win32') {
            const base =
                process.env.LOCALAPPDATA ??
                path.join(os.homedir(), 'AppData', 'Local');
            return path.join(base, appDirectoryName);
        }

        if (process.platform === 'darwin') {
            return path.join(
                os.homedir(),
                'Library',
                'Application Support',
                appDirectoryName
            );
        }

        const xdgData = process.env.XDG_DATA_HOME;
        const base = xdgData ?? path.join(os.homedir(), '.local', 'share');
        return path.join(base, appDirectoryName);
    })();

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
