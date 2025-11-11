import os from 'node:os';
import path from 'node:path';

export const normalizeSlashes = (value: string): string => value.replace(/\\/g, '/');

export const ensureFileProtocol = (absolutePath: string): string => {
    const normalized = normalizeSlashes(absolutePath);
    return normalized.startsWith('file://') ? normalized : `file://${normalized}`;
};

export const getExecutableDirectory = (executablePath: string): string => {
    const separator = executablePath.includes('\\') ? '\\' : '/';
    const lastSeparatorIndex = executablePath.lastIndexOf(separator);
    return executablePath.substring(0, lastSeparatorIndex + 1);
};

export const toDirectoryFileUrl = (directoryPath: string): URL => {
    return new URL(ensureFileProtocol(directoryPath));
};

interface ResolveAppRootOptions {
    platform?: NodeJS.Platform;
    env?: NodeJS.ProcessEnv;
    homedir?: string;
    appDirectoryName?: string;
}

export const resolveAppRoot = (options: ResolveAppRootOptions = {}): string => {
    const {
        platform = process.platform,
        env = process.env,
        homedir = os.homedir(),
        appDirectoryName = env.CALIL_APP_DIR_NAME ?? 'Calil-management-app',
    } = options;

    if (platform === 'win32') {
        const base =
            env.LOCALAPPDATA ??
            path.join(homedir, 'AppData', 'Local');
        return path.join(base, appDirectoryName);
    }

    if (platform === 'darwin') {
        return path.join(
            homedir,
            'Library',
            'Application Support',
            appDirectoryName,
        );
    }

    const xdgData = env.XDG_DATA_HOME;
    const base = xdgData ?? path.join(homedir, '.local', 'share');
    return path.join(base, appDirectoryName);
};
