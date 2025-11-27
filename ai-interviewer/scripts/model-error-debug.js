#!/usr/bin/env node

/**
 * Быстрый скрипт для диагностики ошибок модели.
 * Пример запуска:
 *   node scripts/model-error-debug.js task
 *   node scripts/model-error-debug.js analysis
 *   npm run debug:model -- --mode question
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import TaskGenerator from '../src/llm/task-generator.js';
import SolutionAnalyzer from '../src/llm/solution-analyzer.js';
import ReportGenerator from '../src/llm/report-generator.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logDir = path.join(__dirname, '../logs');

const args = process.argv.slice(2);
const argMap = { _: [] };

for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg.startsWith('--')) {
        const [rawKey, inlineValue] = arg.split('=');
        const key = rawKey.replace(/^--/, '');
        if (inlineValue !== undefined) {
            argMap[key] = inlineValue;
            continue;
        }
        const next = args[i + 1];
        if (next && !next.startsWith('-')) {
            argMap[key] = next;
            i += 1;
        } else {
            argMap[key] = true;
        }
    } else if (arg.startsWith('-') && arg.length === 2) {
        const key = arg.replace(/^-/, '');
        const next = args[i + 1];
        if (next && !next.startsWith('-')) {
            argMap[key] = next;
            i += 1;
        } else {
            argMap[key] = true;
        }
    } else {
        argMap._.push(arg);
    }
}

const mode = (argMap.mode || argMap.m || argMap._[0] || 'task').toLowerCase();
const level = argMap.level || 'Middle';
const topic = argMap.topic || 'arrays';
const language = argMap.language || 'python';

const sampleTask = {
    id: 'debug-task',
    level: 'Middle',
    topic: 'arrays',
    language: 'python',
    description: 'Дан массив целых чисел. Найдите максимальную сумму подпоследовательности.',
    requirements: [
        'Решение должно работать за O(n).',
        'Используйте один проход по массиву.'
    ],
    constraints: [
        '1 <= len(nums) <= 10^5',
        '-10^4 <= nums[i] <= 10^4'
    ],
    visibleTestCases: [
        { input: '[1, -2, 3, 4, -1]', output: '7' },
        { input: '[-5, -3, -1]', output: '-1' }
    ],
    hiddenTestCases: [
        { input: '[1000, -1, 1000]', output: '1999' }
    ],
    examples: [
        {
            input: '[1, -2, 3, 4, -1]',
            output: '7',
            explanation: 'Максимальная сумма у подпоследовательности [3,4].'
        }
    ]
};

const sampleSolution = `def solution(nums):
    best = float('-inf')
    current = 0
    for num in nums:
        current = max(num, current + num)
        best = max(best, current)
    return best`;

const sampleTestResults = {
    visible: sampleTask.visibleTestCases.map(test => ({
        input: test.input,
        expected: test.output,
        actual: test.output,
        passed: true
    })),
    hidden: sampleTask.hiddenTestCases.map(test => ({
        input: test.input,
        expected: test.output,
        actual: test.output,
        passed: true
    })),
    allPassed: true
};

const sampleAnalysis = {
    overallScore: 85,
    correctness: 'Решение корректно проходит все тесты',
    optimality: 'Алгоритм Кадане дает оптимальную временную сложность O(n)',
    codeQuality: 'Код лаконичный, использует понятные имена переменных'
};

const sampleChatHistory = [
    { role: 'assistant', content: 'Расскажите, как вы находили максимальную сумму подпоследовательности?' },
    { role: 'user', content: 'Я использовал алгоритм Кадане и поддерживал текущую и глобальную суммы.' }
];

const sampleMetrics = {
    tasksCount: 1,
    overallScore: sampleAnalysis.overallScore,
    timeSpent: 5
};

const actions = {
    async task() {
        const generator = new TaskGenerator();
        return generator.generateTask({ level, topic, language });
    },
    async analysis() {
        const analyzer = new SolutionAnalyzer();
        return analyzer.analyze({
            task: sampleTask,
            code: sampleSolution,
            testResults: sampleTestResults,
            previousAttempts: 0
        });
    },
    async question() {
        const analyzer = new SolutionAnalyzer();
        return analyzer.generateFollowUpQuestion({
            task: sampleTask,
            solution: sampleSolution,
            testResults: sampleTestResults,
            analysis: sampleAnalysis
        });
    },
    async report() {
        const generator = new ReportGenerator();
        return generator.generateReport({
            sessionId: 'debug-session',
            candidateId: 'debug-candidate',
            taskHistory: [{
                task: sampleTask,
                solution: sampleSolution,
                analysis: sampleAnalysis,
                testResults: sampleTestResults
            }],
            chatHistory: sampleChatHistory,
            metrics: sampleMetrics
        });
    }
};

function ensureLogDir() {
    try {
        fs.mkdirSync(logDir, { recursive: true });
    } catch (error) {
        console.error('Не удалось создать директорию логов:', error.message);
    }
}

function captureError(error) {
    ensureLogDir();
    const payload = {
        timestamp: new Date().toISOString(),
        mode,
        level,
        topic,
        language,
        message: error.message,
        name: error.name,
        status: error.status,
        stack: error.stack,
        response: error.response?.data || error.data || null,
        cause: error.cause?.message
    };
    const logPath = path.join(logDir, `model-error-${mode}-${Date.now()}.json`);
    fs.writeFileSync(logPath, JSON.stringify(payload, null, 2));
    console.error(`❌ Ошибка модели. Подробности сохранены в ${logPath}`);
    console.error(JSON.stringify(payload, null, 2));
    process.exit(1);
}

async function main() {
    if (!actions[mode]) {
        console.error(`Неизвестный режим "${mode}". Доступны: ${Object.keys(actions).join(', ')}`);
        process.exit(1);
    }

    console.log(`▶️  Диагностика модели (режим: ${mode}, уровень: ${level}, тема: ${topic})`);

    try {
        const result = await actions[mode]();
        const preview = typeof result === 'string'
            ? result
            : JSON.stringify(result, null, 2);

        console.log('✅ Ответ получен. Первые 500 символов:');
        console.log(preview.substring(0, 500));
    } catch (error) {
        captureError(error);
    }
}

main();


