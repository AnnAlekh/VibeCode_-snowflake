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

export async function runCodeInSandbox({
  language = 'python',
  code,
  input = '',
  timeoutMs = 5000
}) {
  if (!code) {
    throw new Error('Code is required');
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
    const child = spawn(config.command, args, {
      cwd: tmpDir,
      stdio: 'pipe',
      env: process.env
    });

    let stdout = '';
    let stderr = '';

    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.on('data', chunk => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });

    if (input) {
      child.stdin.write(input);
    }
    child.stdin.end();

    const exitCode = await new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('close', code => resolve(code));
    });

    clearTimeout(timeoutHandle);

    return {
      stdout: stdout.trimEnd(),
      stderr: stderr.trimEnd(),
      exitCode,
      timedOut,
      executionTime: Date.now() - start
    };
  } finally {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
}

