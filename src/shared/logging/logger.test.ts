import { test, expect, describe, beforeEach } from 'bun:test';
import { logger } from './logger';

describe('Logger', () => {
  beforeEach(() => {
    // 各テストの前にログをクリア
    logger.clear();
  });

  describe('基本的なログ機能', () => {
    test('infoレベルのログを記録できる', () => {
      logger.info('Test info message');
      const logs = logger.getLogs();

      expect(logs.length).toBe(1);
      expect(logs[0]?.level).toBe('info');
      expect(logs[0]?.message).toBe('Test info message');
      expect(logs[0]?.timestamp).toBeInstanceOf(Date);
    });

    test('warnレベルのログを記録できる', () => {
      logger.warn('Test warning');
      const logs = logger.getLogs();

      expect(logs[0]?.level).toBe('warn');
      expect(logs[0]?.message).toBe('Test warning');
    });

    test('errorレベルのログを記録できる', () => {
      logger.error('Test error');
      const logs = logger.getLogs();

      expect(logs[0]?.level).toBe('error');
      expect(logs[0]?.message).toBe('Test error');
    });

    test('debugレベルのログを記録できる', () => {
      logger.debug('Test debug');
      const logs = logger.getLogs();

      expect(logs[0]?.level).toBe('debug');
      expect(logs[0]?.message).toBe('Test debug');
    });
  });

  describe('データ付きログ', () => {
    test('オブジェクトデータを含むログを記録できる', () => {
      const testData = { userId: 123, action: 'login' };
      logger.info('User action', testData);

      const logs = logger.getLogs();
      expect(logs[0]?.data).toEqual(testData);
    });

    test('文字列データを含むログを記録できる', () => {
      logger.info('Message', 'extra info');

      const logs = logger.getLogs();
      expect(logs[0]?.data).toBe('extra info');
    });

    test('数値データを含むログを記録できる', () => {
      logger.info('Count', 42);

      const logs = logger.getLogs();
      expect(logs[0]?.data).toBe(42);
    });
  });

  describe('複数のログエントリ', () => {
    test('複数のログを順番に記録できる', () => {
      logger.info('First');
      logger.warn('Second');
      logger.error('Third');

      const logs = logger.getLogs();
      expect(logs.length).toBe(3);
      expect(logs[0]?.message).toBe('First');
      expect(logs[1]?.message).toBe('Second');
      expect(logs[2]?.message).toBe('Third');
    });

    test('異なるレベルのログを混在できる', () => {
      logger.debug('Debug message');
      logger.info('Info message');
      logger.warn('Warning message');
      logger.error('Error message');

      const logs = logger.getLogs();
      expect(logs.length).toBe(4);
      expect(logs.map(l => l.level)).toEqual(['debug', 'info', 'warn', 'error']);
    });
  });

  describe('ログの取得と制限', () => {
    test('getLogs()で全てのログを取得できる', () => {
      logger.info('Log 1');
      logger.info('Log 2');
      logger.info('Log 3');

      const logs = logger.getLogs();
      expect(logs.length).toBe(3);
    });

    test('getLogs(limit)で最新のN件を取得できる', () => {
      logger.info('Log 1');
      logger.info('Log 2');
      logger.info('Log 3');
      logger.info('Log 4');
      logger.info('Log 5');

      const logs = logger.getLogs(3);
      expect(logs.length).toBe(3);
      expect(logs[0]?.message).toBe('Log 3');
      expect(logs[1]?.message).toBe('Log 4');
      expect(logs[2]?.message).toBe('Log 5');
    });

    test('limitが全ログ数より大きい場合は全てのログを返す', () => {
      logger.info('Log 1');
      logger.info('Log 2');

      const logs = logger.getLogs(10);
      expect(logs.length).toBe(2);
    });
  });

  describe('ログのクリア', () => {
    test('clear()で全てのログを削除できる', () => {
      logger.info('Log 1');
      logger.info('Log 2');
      logger.info('Log 3');

      expect(logger.getLogs().length).toBe(3);

      logger.clear();

      expect(logger.getLogs().length).toBe(0);
    });
  });

  describe('最大ログ数の制限', () => {
    test('500件を超えると古いログが削除される', () => {
      // 501件のログを追加
      for (let i = 0; i < 501; i++) {
        logger.info(`Log ${i}`);
      }

      const logs = logger.getLogs();
      expect(logs.length).toBe(500);
      // 最も古いログ（Log 0）は削除されている
      expect(logs[0]?.message).toBe('Log 1');
      // 最新のログは保持されている
      expect(logs[499]?.message).toBe('Log 500');
    });
  });

  describe('formatForDisplay', () => {
    test('ログを表示用にフォーマットできる', () => {
      logger.info('Test message');
      const formatted = logger.formatForDisplay();

      expect(formatted).toContain('ℹ️');
      expect(formatted).toContain('Test message');
    });

    test('データ付きログを正しくフォーマットする', () => {
      logger.error('Error occurred', { code: 500 });
      const formatted = logger.formatForDisplay();

      expect(formatted).toContain('❌');
      expect(formatted).toContain('Error occurred');
      expect(formatted).toContain('"code"');
      expect(formatted).toContain('500');
    });

    test('異なるレベルに対応するアイコンを使用する', () => {
      logger.info('Info');
      logger.warn('Warn');
      logger.error('Error');
      logger.debug('Debug');

      const formatted = logger.formatForDisplay();

      expect(formatted).toContain('ℹ️');
      expect(formatted).toContain('⚠️');
      expect(formatted).toContain('❌');
      expect(formatted).toContain('🔍');
    });
  });

  describe('タイムスタンプ', () => {
    test('各ログエントリにタイムスタンプが付与される', () => {
      const before = new Date();
      logger.info('Test');
      const after = new Date();

      const logs = logger.getLogs();
      const timestamp = logs[0]?.timestamp;

      expect(timestamp).toBeInstanceOf(Date);
      expect(timestamp!.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(timestamp!.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });
});
