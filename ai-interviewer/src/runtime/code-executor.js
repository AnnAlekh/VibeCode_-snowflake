import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';

const LANGUAGE_CONFIG = {
  python: {
    filename: 'main.py',
    command: 'python3',
    args: file => [file]
  },
  javascript: {
    filename: 'main.js',
    command: 'node',
    args: file => [file]
  }
};

// Список опасных паттернов для проверки безопасности
const DANGEROUS_PATTERNS = {
  python: [
    // Файловые операции с абсолютными путями
    /open\s*\([^)]*['"](?:\/|\.\.)/,  // open('/etc/..., open('../...')
    // Опасные импорты
    /__import__\s*\([^)]*['"](?:os|subprocess|sys|shutil|urllib|requests|socket|http|ftplib)/,
    /import\s+(?:os|subprocess|sys|shutil|urllib|requests|socket|http|ftplib)/,
    // Выполнение кода
    /exec\s*\(/,                       // exec()
    /eval\s*\(/,                       // eval()
    /compile\s*\(/,                    // compile()
    // Системные вызовы
    /\.system\s*\(/,                   // os.system(), subprocess.system()
    /\.popen\s*\(/,                    // os.popen()
    /subprocess\.(?:call|run|Popen)/,  // subprocess вызовы
  ],
  javascript: [
    /require\s*\(\s*['"](?:fs|child_process|http|https|net)['"]/,
    /eval\s*\(/,
    /Function\s*\(/,
  ]
};

// Проверка кода на опасные операции
function validateCodeSafety(code, language) {
  const patterns = DANGEROUS_PATTERNS[language] || [];
  const detected = [];
  
  for (const pattern of patterns) {
    if (pattern.test(code)) {
      detected.push(pattern.toString());
    }
  }
  
  return {
    safe: detected.length === 0,
    detectedPatterns: detected
  };
}

export async function runCodeInSandbox({
  language = 'python',
  code,
  input = '',
  timeoutMs = 5000
}) {
  if (!code) {
    throw new Error('Code is required');
  }

  // Предварительная проверка безопасности кода
  const safetyCheck = validateCodeSafety(code, language);
  if (!safetyCheck.safe) {
    return {
      stdout: '',
      stderr: `Security violation: Detected dangerous operations. File system, network, and system operations are not allowed in the sandbox.`,
      exitCode: 1,
      timedOut: false,
      executionTime: 0,
      error: 'Security violation: Dangerous operations detected',
      blocked: true
    };
  }

  const config = LANGUAGE_CONFIG[language];
  if (!config) {
    throw new Error(`Language "${language}" is not supported`);
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-runtime-'));
  const filePath = path.join(tmpDir, config.filename);

  let timedOut = false;
  const start = Date.now();

  try {
    await fs.writeFile(filePath, code, 'utf8');

    const args = config.args(filePath);
    
    // Ограничиваем окружение выполнения для безопасности
    const safeEnv = {
      ...Object.fromEntries(
        Object.entries(process.env).filter(([key]) => 
          !['PATH', 'HOME'].includes(key) || key === 'NODE_ENV'
        )
      ),
      PATH: '/usr/local/bin:/usr/bin:/bin',
      HOME: tmpDir,
      TMPDIR: tmpDir,
      PYTHONUNBUFFERED: '1' // Для корректного вывода Python
    };
    
    const child = spawn(config.command, args, {
      cwd: tmpDir,
      stdio: 'pipe',
      env: safeEnv,
      maxBuffer: 1024 * 1024 // 1MB limit
    });

    let stdout = '';
    let stderr = '';

    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      try {
        child.kill('SIGKILL');
      } catch (e) {
        // Игнорируем ошибки при завершении
      }
    }, timeoutMs);

    child.stdout.on('data', chunk => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });

    // Записываем входные данные если есть
    const exitCode = await new Promise((resolve, reject) => {
      child.on('error', reject);
      
      if (input) {
        // Даем процессу немного времени на запуск перед записью входных данных
        setTimeout(() => {
          try {
            if (!child.killed && child.stdin.writable) {
              child.stdin.write(input);
              child.stdin.end();
            }
          } catch (writeError) {
            // Игнорируем ошибки записи если процесс уже завершен
          }
        }, 50);
      } else {
        try {
          child.stdin.end();
        } catch (e) {
          // Игнорируем ошибки
        }
      }
      
      child.on('close', code => resolve(code));
    });

    clearTimeout(timeoutHandle);

    // Даем время на завершение записи stdout/stderr
    await new Promise(resolve => setTimeout(resolve, 100));

    // Убеждаемся, что весь вывод прочитан
    const cleanStdout = stdout.trimEnd();
    const cleanStderr = stderr.trimEnd();

    // Проверяем stderr на ошибки безопасности и блокируем доступ
    const hasSecurityError = cleanStderr.toLowerCase().includes('security') || 
                            cleanStderr.toLowerCase().includes('blocked') ||
                            cleanStderr.toLowerCase().includes('permission denied') ||
                            cleanStderr.toLowerCase().includes('not allowed') ||
                            cleanStderr.toLowerCase().includes('no such file') ||
                            (cleanStderr && exitCode !== 0 && !cleanStdout);

    return {
      stdout: cleanStdout || '',
      stderr: cleanStderr || '',
      exitCode: exitCode || 0,
      timedOut,
      executionTime: Date.now() - start,
      error: timedOut ? 'Execution timeout' : (hasSecurityError ? 'Security restriction or execution error' : (exitCode !== 0 && !cleanStderr ? 'Unknown error' : null)),
      blocked: hasSecurityError || timedOut
    };
  } finally {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
}
