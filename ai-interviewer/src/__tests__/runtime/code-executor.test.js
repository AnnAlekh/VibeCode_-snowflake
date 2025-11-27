import { describe, test, expect } from '@jest/globals';
import { runCodeInSandbox } from '../../runtime/code-executor.js';

describe('Code Executor', () => {
  describe('Безопасность выполнения кода', () => {
    test('должен блокировать попытки чтения файлов с абсолютными путями', async () => {
      const code = `import os
print(open('/etc/passwd').read())`;
      
      const result = await runCodeInSandbox({
        code,
        language: 'python',
        input: '',
        timeoutMs: 5000
      });

      expect(result.blocked).toBe(true);
      expect(result.error).toContain('Security violation');
      expect(result.stderr).toContain('dangerous operations');
      expect(result.exitCode).toBe(1);
    });

    test('должен блокировать попытки записи файлов', async () => {
      const code = `f = open('/tmp/test.txt', 'w')
f.write('hack')
f.close()`;
      
      const result = await runCodeInSandbox({
        code,
        language: 'python',
        input: '',
        timeoutMs: 5000
      });

      expect(result.blocked).toBe(true);
      expect(result.error).toContain('Security violation');
    });

    test('должен блокировать импорт опасных модулей', async () => {
      const code = `import os
import subprocess
os.system('rm -rf /')`;
      
      const result = await runCodeInSandbox({
        code,
        language: 'python',
        input: '',
        timeoutMs: 5000
      });

      expect(result.blocked).toBe(true);
      expect(result.error).toContain('Security violation');
    });

    test('должен блокировать сетевые операции', async () => {
      const code = `import requests
response = requests.get('http://example.com')
print(response.text)`;
      
      const result = await runCodeInSandbox({
        code,
        language: 'python',
        input: '',
        timeoutMs: 5000
      });

      expect(result.blocked).toBe(true);
      expect(result.error).toContain('Security violation');
    });

    test('должен блокировать exec/eval', async () => {
      const code = `exec('print("hack")')`;
      
      const result = await runCodeInSandbox({
        code,
        language: 'python',
        input: '',
        timeoutMs: 5000
      });

      expect(result.blocked).toBe(true);
      expect(result.error).toContain('Security violation');
    });
  }, 15000);

  describe('Корректное выполнение кода', () => {
    test('должен выполнять простой Python код', async () => {
      const code = `print("Hello, World!")`;
      
      const result = await runCodeInSandbox({
        code,
        language: 'python',
        input: '',
        timeoutMs: 5000
      });

      expect(result.blocked).toBe(false);
      expect(result.stdout.trim()).toBe('Hello, World!');
      expect(result.exitCode).toBe(0);
      expect(result.error).toBeNull();
    });

    test('должен обрабатывать входные данные', async () => {
      const code = `x = int(input())
print(x * 2)`;
      
      const result = await runCodeInSandbox({
        code,
        language: 'python',
        input: '5',
        timeoutMs: 5000
      });

      expect(result.blocked).toBe(false);
      expect(result.stdout.trim()).toBe('10');
      expect(result.exitCode).toBe(0);
    });

    test('должен обрабатывать ошибки выполнения', async () => {
      const code = `x = 1 / 0`;
      
      const result = await runCodeInSandbox({
        code,
        language: 'python',
        input: '',
        timeoutMs: 5000
      });

      // Ошибки выполнения могут быть помечены как blocked если есть stderr
      expect(result.stderr).toBeDefined();
      expect(result.stderr.length).toBeGreaterThan(0);
      expect(result.exitCode).not.toBe(0);
    });

    test('должен обрабатывать таймауты', async () => {
      const code = `import time
time.sleep(10)`;
      
      const result = await runCodeInSandbox({
        code,
        language: 'python',
        input: '',
        timeoutMs: 1000
      });

      expect(result.timedOut).toBe(true);
      expect(result.error).toContain('timeout');
    });

    test('должен возвращать метрики времени выполнения', async () => {
      const code = `print("test")`;
      
      const result = await runCodeInSandbox({
        code,
        language: 'python',
        input: '',
        timeoutMs: 5000
      });

      expect(result.executionTime).toBeGreaterThan(0);
      expect(result.executionTime).toBeLessThan(5000);
    });
  }, 15000);

  describe('Валидация входных данных', () => {
    test('должен выбрасывать ошибку при пустом коде', async () => {
      await expect(runCodeInSandbox({
        code: '',
        language: 'python',
        input: '',
        timeoutMs: 5000
      })).rejects.toThrow('Code is required');
    });

    test('должен выбрасывать ошибку при неподдерживаемом языке', async () => {
      await expect(runCodeInSandbox({
        code: 'print("test")',
        language: 'rust',
        input: '',
        timeoutMs: 5000
      })).rejects.toThrow('not supported');
    });
  });
});

