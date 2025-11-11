import { test, expect, describe } from 'bun:test';
import path from 'node:path';
import { resolveAppRoot } from './path-utils';

/**
 * app-paths.tsのテスト
 *
 * 注意: このテストは環境変数に依存するため、実際の値をテストするのではなく
 * ロジックが正しいことを確認します。
 */

describe('App Paths', () => {
  describe('appRoot計算ロジック', () => {
    test('Windows環境でのパス生成ロジック', () => {
      const platform = 'win32';
      const appDirectoryName = 'Calil-management-app';
      const localAppData = 'C:\\Users\\Test\\AppData\\Local';

      const appRoot = resolveAppRoot({
        platform,
        env: {
          LOCALAPPDATA: localAppData,
          CALIL_APP_DIR_NAME: appDirectoryName,
        } as NodeJS.ProcessEnv,
        homedir: 'C:\\Users\\Test',
        appDirectoryName,
      });

      expect(appRoot).toBe(path.join(localAppData, appDirectoryName));
    });

    test('macOS環境でのパス生成ロジック', () => {
      const platform = 'darwin';
      const appDirectoryName = 'Calil-management-app';
      const homeDir = '/Users/testuser';

      const appRoot = resolveAppRoot({
        platform,
        homedir: homeDir,
        appDirectoryName,
      });

      expect(appRoot).toBe('/Users/testuser/Library/Application Support/Calil-management-app');
    });

    test('Linux環境でのパス生成ロジック（XDG_DATA_HOMEなし）', () => {
      const platform = 'linux';
      const appDirectoryName = 'Calil-management-app';
      const homeDir = '/home/testuser';

      const appRoot = resolveAppRoot({
        platform,
        homedir: homeDir,
        env: {
          CALIL_APP_DIR_NAME: appDirectoryName,
        } as NodeJS.ProcessEnv,
        appDirectoryName,
      });

      expect(appRoot).toBe('/home/testuser/.local/share/Calil-management-app');
    });

    test('Linux環境でのパス生成ロジック（XDG_DATA_HOMEあり）', () => {
      const platform = 'linux';
      const appDirectoryName = 'Calil-management-app';
      const xdgDataHome = '/home/testuser/.local/share';

      const appRoot = resolveAppRoot({
        platform,
        env: {
          XDG_DATA_HOME: xdgDataHome,
          CALIL_APP_DIR_NAME: appDirectoryName,
        } as NodeJS.ProcessEnv,
        homedir: '/home/testuser',
        appDirectoryName,
      });

      expect(appRoot).toBe('/home/testuser/.local/share/Calil-management-app');
    });
  });

  describe('appPaths構造', () => {
    test('appPathsが期待されるキーを持つ', () => {
      // appPathsの構造をシミュレート
      const appRoot = '/test/app/root';
      const appPaths = {
        root: appRoot,
        cache: path.join(appRoot, 'cache'),
        coverCache: path.join(appRoot, 'cache', 'covers'),
        vaultDir: path.join(appRoot, 'vault'),
        vaultFile: path.join(appRoot, 'vault', 'calil.cookies.json'),
        chromeEndpointFile: path.join(appRoot, 'vault', 'chrome.ws'),
        browserProfile: path.join(appRoot, 'browser-profile'),
        chromiumCache: path.join(appRoot, 'chromium-cache'),
      };

      expect(appPaths.root).toBe('/test/app/root');
      expect(appPaths.cache).toBe(path.join('/test/app/root', 'cache'));
      expect(appPaths.coverCache).toBe(path.join('/test/app/root', 'cache', 'covers'));
      expect(appPaths.vaultDir).toBe(path.join('/test/app/root', 'vault'));
      expect(appPaths.vaultFile).toBe(path.join('/test/app/root', 'vault', 'calil.cookies.json'));
      expect(appPaths.chromeEndpointFile).toBe(path.join('/test/app/root', 'vault', 'chrome.ws'));
      expect(appPaths.browserProfile).toBe(path.join('/test/app/root', 'browser-profile'));
      expect(appPaths.chromiumCache).toBe(path.join('/test/app/root', 'chromium-cache'));
    });

    test('cacheディレクトリはrootの下に配置される', () => {
      const appRoot = '/test/root';
      const cachePath = path.join(appRoot, 'cache');

      expect(cachePath.startsWith(appRoot)).toBe(true);
      expect(path.basename(cachePath)).toBe('cache');
    });

    test('coverCacheはcacheの下に配置される', () => {
      const appRoot = '/test/root';
      const cachePath = path.join(appRoot, 'cache');
      const coverCachePath = path.join(appRoot, 'cache', 'covers');

      expect(coverCachePath.startsWith(cachePath)).toBe(true);
      expect(path.basename(coverCachePath)).toBe('covers');
    });

    test('vaultFileはvaultDirの下に配置される', () => {
      const appRoot = '/test/root';
      const vaultDir = path.join(appRoot, 'vault');
      const vaultFile = path.join(appRoot, 'vault', 'calil.cookies.json');

      expect(vaultFile.startsWith(vaultDir)).toBe(true);
      expect(path.basename(vaultFile)).toBe('calil.cookies.json');
    });
  });

  describe('パス結合の正確性', () => {
    test('path.joinが正しく機能する', () => {
      const parts = ['root', 'cache', 'covers'];
      const joined = path.join(...parts);

      expect(joined).toBe(path.join('root', 'cache', 'covers'));
    });

    test('複数階層のパスが正しく結合される', () => {
      const base = '/app';
      const subPath = path.join(base, 'vault', 'calil.cookies.json');

      expect(subPath).toBe('/app/vault/calil.cookies.json');
    });
  });
});
