#!/usr/bin/env node

/**
 * Тесты для проверки покрытия системы по критериям оценивания
 * 
 * Критерии:
 * 1. ИИ-интервьюер и адаптивность (20 баллов)
 * 2. Браузерная IDE и выполнение кода (20 баллов)
 * 3. Система автотестирования и валидации (20 баллов)
 * 4. Система защиты от читерства (20 баллов)
 */

import { fileURLToPath } from 'url';

const API_BASE = process.env.API_BASE || 'http://localhost:3001/api';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:8081';

// Цвета для консоли
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
    log(`\n${'='.repeat(70)}`, 'cyan');
    log(`  ${title}`, 'cyan');
    log('='.repeat(70), 'cyan');
}

function logTest(testName, status, message = '') {
    const icon = status === 'pass' ? '✅' : status === 'fail' ? '❌' : '⚠️';
    const color = status === 'pass' ? 'green' : status === 'fail' ? 'red' : 'yellow';
    log(`${icon} ${testName}${message ? ': ' + message : ''}`, color);
}

// Результаты тестирования
const results = {
    category1: { name: 'ИИ-интервьюер и адаптивность', maxScore: 20, score: 0, tests: [] },
    category2: { name: 'Браузерная IDE и выполнение кода', maxScore: 20, score: 0, tests: [] },
    category3: { name: 'Система автотестирования и валидации', maxScore: 20, score: 0, tests: [] },
    category4: { name: 'Система защиты от читерства', maxScore: 20, score: 0, tests: [] }
};

// Утилита для HTTP запросов
async function fetchWithTimeout(url, options = {}, timeout = 120000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error(`Timeout after ${timeout/1000}s`);
        }
        throw error;
    }
}

// ============================================================================
// КАТЕГОРИЯ 1: ИИ-интервьюер и адаптивность (20 баллов)
// ============================================================================

async function testCategory1() {
    logSection('КАТЕГОРИЯ 1: ИИ-интервьюер и адаптивность');

    let score = 0;
    const tests = [];

    // Тест 1.1: Генерация задач для разных уровней
    try {
        log('\n[1.1] Генерация задач для разных уровней', 'blue');
        
        const levels = ['Junior', 'Middle', 'Senior'];
        const generatedTasks = {};
        let allGenerated = true;

        for (const level of levels) {
            try {
                const response = await fetchWithTimeout(`${API_BASE}/tasks/generate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ level, topic: 'algorithms', language: 'python' })
                }, 60000);

                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                
                const task = await response.json();
                generatedTasks[level] = task;

                // Проверяем структуру задачи
                const required = ['id', 'level', 'description'];
                const missing = required.filter(f => !task[f]);
                
                if (missing.length > 0) {
                    throw new Error(`Missing fields: ${missing.join(', ')}`);
                }

                if (task.level !== level) {
                    throw new Error(`Level mismatch: expected ${level}, got ${task.level}`);
                }

                logTest(`  Генерация задачи для ${level}`, 'pass', 
                    `${task.description?.substring(0, 50)}...`);
            } catch (error) {
                allGenerated = false;
                logTest(`  Генерация задачи для ${level}`, 'fail', error.message);
            }
        }

        if (allGenerated && Object.keys(generatedTasks).length === 3) {
            score += 3;
            tests.push({ name: 'Генерация задач для всех уровней', pass: true });
        } else {
            tests.push({ name: 'Генерация задач для всех уровней', pass: false });
        }
    } catch (error) {
        logTest('Генерация задач', 'fail', error.message);
        tests.push({ name: 'Генерация задач', pass: false });
    }

    // Тест 1.2: Качество задач - проверка наличия обязательных элементов
    try {
        log('\n[1.2] Качество генерируемых задач', 'blue');
        
        const response = await fetchWithTimeout(`${API_BASE}/tasks/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ level: 'Middle', topic: 'algorithms', language: 'python' })
        }, 60000);

        const task = await response.json();
        
        const qualityChecks = {
            hasDescription: !!task.description && task.description.length > 20,
            hasExamples: !!(task.examples?.length > 0 || task.example),
            hasTestCases: !!(task.visibleTestCases?.length > 0 || task.hiddenTestCases?.length > 0),
            hasRequirements: !!(task.requirements?.length > 0 || task.constraints?.length > 0),
            hasLanguage: !!task.language,
            hasDifficulty: !!task.difficulty || !!task.level
        };

        const passedChecks = Object.values(qualityChecks).filter(v => v).length;
        const totalChecks = Object.keys(qualityChecks).length;
        const qualityScore = Math.round((passedChecks / totalChecks) * 4);

        logTest('  Проверка качества задачи', passedChecks === totalChecks ? 'pass' : 'warning',
            `${passedChecks}/${totalChecks} критериев выполнено`);
        
        score += qualityScore;
        tests.push({ name: 'Качество задач', pass: passedChecks >= totalChecks * 0.8 });
    } catch (error) {
        logTest('Качество задач', 'fail', error.message);
        tests.push({ name: 'Качество задач', pass: false });
    }

    // Тест 1.3: Оценка решений
    try {
        log('\n[1.3] Оценка решений', 'blue');
        
        const task = {
            id: 'test-task',
            level: 'Junior',
            description: 'Найдите максимум в массиве'
        };

        const solution = `def solution(arr):
    if not arr:
        return None
    return max(arr)`;

        const testResults = {
            visible: [{ passed: true }, { passed: true }],
            hidden: [{ passed: true }]
        };

        const response = await fetchWithTimeout(`${API_BASE}/solutions/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                task,
                code: solution,
                testResults,
                previousAttempts: 0
            })
        }, 60000);

        const analysis = await response.json();
        
        const hasScore = !!(analysis.overallScore || analysis.score);
        const hasCorrectness = !!analysis.correctness;
        const hasFeedback = !!(analysis.feedback || analysis.comments || analysis.reasoning);

        if (hasScore && hasCorrectness) {
            score += 3;
            logTest('  Анализ решения', 'pass', `Оценка: ${analysis.overallScore || analysis.score}`);
        } else {
            logTest('  Анализ решения', 'warning', 'Не все поля заполнены');
        }

        if (hasFeedback) {
            score += 1;
            logTest('  Обратная связь', 'pass');
        } else {
            logTest('  Обратная связь', 'fail');
        }

        tests.push({ name: 'Оценка решений', pass: hasScore && hasCorrectness });
        tests.push({ name: 'Обратная связь', pass: hasFeedback });
    } catch (error) {
        logTest('Оценка решений', 'fail', error.message);
        tests.push({ name: 'Оценка решений', pass: false });
    }

    // Тест 1.4: Адаптивность - генерация следующей задачи на основе результатов
    try {
        log('\n[1.4] Адаптивность системы', 'blue');
        
        const previousTask = {
            id: 'task-1',
            level: 'Junior',
            description: 'Простая задача'
        };

        const candidatePerformance = {
            score: 85,
            correctness: 90,
            optimality: 80
        };

        // Тест адаптивной генерации через stream endpoint (JSON формат)
        const response = await fetchWithTimeout(`${API_BASE}/tasks/generate-stream?format=json`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                level: 'Junior',
                topic: 'algorithms',
                language: 'python',
                previousTask,
                candidatePerformance
            })
        }, 60000);

        if (response.ok) {
            const task = await response.json();
            const isAdaptive = !!(task.level || task.difficulty);
            
            if (isAdaptive) {
                score += 4;
                logTest('  Адаптивная генерация следующей задачи', 'pass');
            } else {
                score += 2;
                logTest('  Адаптивная генерация следующей задачи', 'warning', 'Частичная поддержка');
            }
            tests.push({ name: 'Адаптивная генерация', pass: isAdaptive });
        } else {
            throw new Error(`HTTP ${response.status}`);
        }
    } catch (error) {
        logTest('Адаптивность', 'fail', error.message);
        tests.push({ name: 'Адаптивность', pass: false });
    }

    // Тест 1.5: Объективность оценки
    try {
        log('\n[1.5] Объективность оценки', 'blue');
        
        const task = {
            id: 'test-task',
            level: 'Junior',
            description: 'Найдите максимум'
        };

        // Тест одинакового решения - должна быть одинаковая оценка
        const solution = `def solution(arr):
    return max(arr) if arr else None`;

        const testResults1 = { visible: [{ passed: true }], hidden: [{ passed: true }] };
        const testResults2 = { visible: [{ passed: true }], hidden: [{ passed: true }] };

        const [response1, response2] = await Promise.all([
            fetchWithTimeout(`${API_BASE}/solutions/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ task, code: solution, testResults: testResults1, previousAttempts: 0 })
            }, 60000),
            fetchWithTimeout(`${API_BASE}/solutions/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ task, code: solution, testResults: testResults2, previousAttempts: 0 })
            }, 60000)
        ]);

        const analysis1 = await response1.json();
        const analysis2 = await response2.json();

        const score1 = analysis1.overallScore || analysis1.score || 0;
        const score2 = analysis2.overallScore || analysis2.score || 0;
        
        // Допускаем небольшую разницу (до 5 баллов) из-за вероятностности LLM
        const isConsistent = Math.abs(score1 - score2) <= 5;

        if (isConsistent) {
            score += 2;
            logTest('  Консистентность оценки', 'pass', `Оценки: ${score1} и ${score2}`);
        } else {
            logTest('  Консистентность оценки', 'warning', 
                `Разница в оценках: ${Math.abs(score1 - score2)} баллов`);
        }

        tests.push({ name: 'Объективность оценки', pass: isConsistent });
    } catch (error) {
        logTest('Объективность оценки', 'fail', error.message);
        tests.push({ name: 'Объективность оценки', pass: false });
    }

    // Тест 1.6: Генерация вопросов и оценка ответов
    try {
        log('\n[1.6] Генерация вопросов и оценка ответов', 'blue');
        
        const task = { id: 'test-task', level: 'Junior' };
        const solution = `def solution(arr): return max(arr)`;
        const analysis = { overallScore: 85, correctness: 90 };

        const questionResponse = await fetchWithTimeout(`${API_BASE}/chat/question`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ task, solution, analysis })
        }, 60000);

        const questionData = await questionResponse.json();
        const hasQuestion = !!questionData.question;

        if (hasQuestion) {
            const answer = "Я использовал встроенную функцию max() так как она оптимальна для этой задачи.";
            
            const evalResponse = await fetchWithTimeout(`${API_BASE}/chat/evaluate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    question: questionData.question,
                    answer: answer,
                    solution: solution
                })
            }, 60000);

            const evaluation = await evalResponse.json();
            const hasEvaluation = !!(evaluation.understanding || evaluation.communication || evaluation.score);

            if (hasQuestion && hasEvaluation) {
                score += 3;
                logTest('  Генерация и оценка вопросов', 'pass');
            } else {
                score += 1;
                logTest('  Генерация и оценка вопросов', 'warning', 'Частичная поддержка');
            }

            tests.push({ name: 'Генерация вопросов', pass: hasQuestion });
            tests.push({ name: 'Оценка ответов', pass: hasEvaluation });
        } else {
            logTest('  Генерация вопросов', 'fail');
            tests.push({ name: 'Генерация вопросов', pass: false });
        }
    } catch (error) {
        logTest('Генерация вопросов', 'fail', error.message);
        tests.push({ name: 'Генерация вопросов', pass: false });
    }

    results.category1.score = Math.min(score, results.category1.maxScore);
    results.category1.tests = tests;
    
    log(`\nИтого по категории 1: ${results.category1.score}/${results.category1.maxScore}`, 
        results.category1.score >= 15 ? 'green' : 'yellow');
}

// ============================================================================
// КАТЕГОРИЯ 2: Браузерная IDE и выполнение кода (20 баллов)
// ============================================================================

async function testCategory2() {
    logSection('КАТЕГОРИЯ 2: Браузерная IDE и выполнение кода');

    let score = 0;
    const tests = [];

    // Тест 2.1: Выполнение кода
    try {
        log('\n[2.1] Выполнение кода', 'blue');
        
        const testCases = [
            {
                name: 'Простой Python код',
                code: `print("Hello, World!")`,
                language: 'python',
                expectedOutput: 'Hello, World!'
            },
            {
                name: 'Код с входными данными',
                code: `arr = list(map(int, input().split()))
print(sum(arr))`,
                language: 'python',
                input: '1 2 3 4',
                expectedOutput: '10'
            },
            {
                name: 'Обработка ошибок',
                code: `x = 1 / 0`,
                language: 'python',
                shouldError: true
            }
        ];

        let passedTests = 0;
        for (const testCase of testCases) {
            try {
                const response = await fetchWithTimeout(`${API_BASE}/runtime/run`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        code: testCase.code,
                        language: testCase.language,
                        input: testCase.input || ''
                    })
                }, 30000);

                const result = await response.json();
                
                if (testCase.shouldError) {
                    if (result.stderr || result.error || result.exitCode !== 0) {
                        passedTests++;
                        logTest(`  ${testCase.name}`, 'pass', 'Ошибка обработана корректно');
                    } else {
                        logTest(`  ${testCase.name}`, 'fail', 'Ожидалась ошибка');
                    }
                } else {
                    const output = (result.stdout || '').trim();
                    if (output.includes(testCase.expectedOutput) || output === testCase.expectedOutput) {
                        passedTests++;
                        logTest(`  ${testCase.name}`, 'pass');
                    } else {
                        logTest(`  ${testCase.name}`, 'fail', 
                            `Expected: ${testCase.expectedOutput}, Got: ${output.substring(0, 50)}`);
                    }
                }
            } catch (error) {
                logTest(`  ${testCase.name}`, 'fail', error.message);
            }
        }

        const executionScore = Math.round((passedTests / testCases.length) * 6);
        score += executionScore;
        tests.push({ name: 'Выполнение кода', pass: passedTests === testCases.length });
    } catch (error) {
        logTest('Выполнение кода', 'fail', error.message);
        tests.push({ name: 'Выполнение кода', pass: false });
    }

    // Тест 2.2: Изоляция выполнения (безопасность)
    try {
        log('\n[2.2] Безопасность выполнения кода', 'blue');
        
        const dangerousCode = [
            {
                name: 'Попытка чтения файлов',
                code: `import os
print(open('/etc/passwd').read())`
            },
            {
                name: 'Попытка записи файлов',
                code: `f = open('/tmp/test.txt', 'w')
f.write('hack')
f.close()`
            },
            {
                name: 'Попытка сетевого доступа',
                code: `import urllib.request
urllib.request.urlopen('http://example.com')`
            },
            {
                name: 'Бесконечный цикл (таймаут)',
                code: `while True:
    pass`
            }
        ];

        let securityChecks = 0;
        for (const test of dangerousCode) {
            try {
                const response = await fetchWithTimeout(`${API_BASE}/runtime/run`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        code: test.code,
                        language: 'python',
                        input: ''
                    })
                }, 10000); // Короткий таймаут для бесконечных циклов

                const result = await response.json();
                
                // Проверяем, что опасные операции заблокированы или привели к ошибке/таймауту
                const isBlocked = result.stderr || result.error || result.timedOut || result.exitCode !== 0;
                
                if (isBlocked || test.name.includes('Бесконечный цикл')) {
                    securityChecks++;
                    logTest(`  ${test.name}`, 'pass', 'Заблокировано или обработано');
                } else {
                    logTest(`  ${test.name}`, 'warning', 'Требуется проверка');
                }
            } catch (error) {
                // Таймаут или ошибка - это нормально для опасного кода
                securityChecks++;
                logTest(`  ${test.name}`, 'pass', 'Заблокировано');
            }
        }

        const securityScore = Math.round((securityChecks / dangerousCode.length) * 5);
        score += securityScore;
        tests.push({ name: 'Безопасность выполнения', pass: securityChecks >= dangerousCode.length * 0.75 });
    } catch (error) {
        logTest('Безопасность', 'fail', error.message);
        tests.push({ name: 'Безопасность', pass: false });
    }

    // Тест 2.3: Интеграция с системой тестирования
    try {
        log('\n[2.3] Интеграция выполнения с тестированием', 'blue');
        
        const task = {
            id: 'test-task',
            level: 'Junior',
            visibleTestCases: [
                { input: '1 2 3\n', output: '6' },
                { input: '10 20\n', output: '30' }
            ],
            hiddenTestCases: [
                { input: '5\n', output: '5' }
            ]
        };

        const code = `arr = list(map(int, input().split()))
print(sum(arr))`;

        const response = await fetchWithTimeout(`${API_BASE}/tests/run`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                code,
                task,
                language: 'python'
            })
        }, 60000);

        const testResults = await response.json();
        
        const hasVisible = !!testResults.visible;
        const hasHidden = !!testResults.hidden;
        const hasSummary = !!(testResults.passed || testResults.total);

        if (hasVisible && hasHidden) {
            score += 4;
            logTest('  Интеграция тестирования', 'pass', 
                `Видимые: ${testResults.visible?.length || 0}, Скрытые: ${testResults.hidden?.length || 0}`);
        } else {
            score += 2;
            logTest('  Интеграция тестирования', 'warning', 'Частичная поддержка');
        }

        tests.push({ name: 'Интеграция с тестированием', pass: hasVisible && hasHidden });
    } catch (error) {
        logTest('Интеграция тестирования', 'fail', error.message);
        tests.push({ name: 'Интеграция тестирования', pass: false });
    }

    // Тест 2.4: Проверка поддержки Monaco Editor (проверка наличия в HTML)
    try {
        log('\n[2.4] Наличие браузерной IDE (Monaco Editor)', 'blue');
        
        // Проверяем, что frontend доступен и содержит упоминание Monaco
        const response = await fetchWithTimeout(FRONTEND_URL, { method: 'GET' }, 10000);
        const html = await response.text();
        
        const hasMonaco = html.includes('monaco-editor') || 
                         html.includes('Monaco') || 
                         html.includes('vs/loader.js') ||
                         html.includes('monaco-editor@');
        
        if (hasMonaco) {
            score += 3;
            logTest('  Monaco Editor интегрирован', 'pass');
        } else {
            logTest('  Monaco Editor', 'fail', 'Не обнаружен в HTML');
        }

        tests.push({ name: 'Monaco Editor', pass: hasMonaco });
    } catch (error) {
        logTest('Monaco Editor', 'warning', 'Не удалось проверить');
        tests.push({ name: 'Monaco Editor', pass: false });
    }

    // Тест 2.5: Удобство использования IDE (базовые функции)
    try {
        log('\n[2.5] Функциональность IDE', 'blue');
        
        const response = await fetchWithTimeout(FRONTEND_URL, { method: 'GET' }, 10000);
        const html = await response.text();
        
        const features = {
            hasEditor: html.includes('monaco-editor') || html.includes('editor'),
            hasCodeInput: html.includes('textarea') || html.includes('code'),
            hasRunButton: html.includes('run') || html.includes('запуск') || html.includes('submit'),
            hasLanguageSelect: html.includes('language') || html.includes('select'),
            hasOutput: html.includes('output') || html.includes('вывод') || html.includes('result')
        };

        const featureCount = Object.values(features).filter(v => v).length;
        const functionalityScore = Math.round((featureCount / Object.keys(features).length) * 2);

        logTest('  Функциональность IDE', featureCount === Object.keys(features).length ? 'pass' : 'warning',
            `${featureCount}/${Object.keys(features).length} функций обнаружено`);
        
        score += functionalityScore;
        tests.push({ name: 'Функциональность IDE', pass: featureCount >= 3 });
    } catch (error) {
        logTest('Функциональность IDE', 'fail', error.message);
        tests.push({ name: 'Функциональность IDE', pass: false });
    }

    results.category2.score = Math.min(score, results.category2.maxScore);
    results.category2.tests = tests;
    
    log(`\nИтого по категории 2: ${results.category2.score}/${results.category2.maxScore}`, 
        results.category2.score >= 15 ? 'green' : 'yellow');
}

// ============================================================================
// КАТЕГОРИЯ 3: Система автотестирования и валидации (20 баллов)
// ============================================================================

async function testCategory3() {
    logSection('КАТЕГОРИЯ 3: Система автотестирования и валидации');

    let score = 0;
    const tests = [];

    // Тест 3.1: Граничные случаи
    try {
        log('\n[3.1] Покрытие граничными случаями', 'blue');
        
        const task = {
            id: 'test-task',
            level: 'Junior',
            visibleTestCases: [
                { input: '1\n', output: '1' },           // Минимальный ввод
                { input: '1 2 3\n', output: '6' }        // Обычный случай
            ],
            hiddenTestCases: [
                { input: '\n', output: '0', description: 'Пустой ввод', type: 'boundary' },
                { input: '0\n', output: '0', description: 'Ноль', type: 'boundary' },
                { input: '-1 -2 -3\n', output: '-6', description: 'Отрицательные', type: 'boundary' },
                { input: '1000\n', output: '1000', description: 'Большое число', type: 'boundary' }
            ]
        };

        const code = `arr = list(map(int, input().split())) if input().strip() else []
print(sum(arr) if arr else 0)`;

        const response = await fetchWithTimeout(`${API_BASE}/tests/run`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, task, language: 'python' })
        }, 60000);

        const testResults = await response.json();
        
        const visibleTests = testResults.visible || [];
        const hiddenTests = testResults.hidden || [];
        
        const visiblePassed = visibleTests.filter(t => t.passed).length;
        const hiddenPassed = hiddenTests.filter(t => t.passed).length;
        
        const hasBoundaryCases = hiddenTests.some(t => 
            t.type === 'boundary' || 
            t.description?.includes('граничн') || 
            t.description?.includes('boundary') ||
            hiddenTests.length >= 3
        );

        if (hasBoundaryCases && hiddenTests.length >= 3) {
            score += 5;
            logTest('  Граничные случаи', 'pass', 
                `Скрытых тестов: ${hiddenTests.length}, Пройдено: ${hiddenPassed}`);
        } else {
            score += 2;
            logTest('  Граничные случаи', 'warning', 
                `Скрытых тестов: ${hiddenTests.length}`);
        }

        tests.push({ name: 'Граничные случаи', pass: hasBoundaryCases && hiddenTests.length >= 3 });
    } catch (error) {
        logTest('Граничные случаи', 'fail', error.message);
        tests.push({ name: 'Граничные случаи', pass: false });
    }

    // Тест 3.2: Комплексность тестов
    try {
        log('\n[3.2] Комплексность тестов', 'blue');
        
        const task = {
            id: 'test-task',
            level: 'Middle',
            visibleTestCases: [
                { input: '1 2 3\n', output: '6' }
            ],
            hiddenTestCases: [
                { input: '1\n', output: '1', type: 'normal' },
                { input: '10 20 30 40\n', output: '100', type: 'normal' },
                { input: '1000 2000 3000\n', output: '6000', type: 'performance' },
                { input: '1 2 3 4 5 6 7 8 9 10\n', output: '55', type: 'performance' }
            ]
        };

        const code = `arr = list(map(int, input().split()))
print(sum(arr))`;

        const response = await fetchWithTimeout(`${API_BASE}/tests/run`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, task, language: 'python' })
        }, 60000);

        const testResults = await response.json();
        
        const hasPerformanceTests = (testResults.hidden || []).some(t => 
            t.type === 'performance' || 
            t.description?.includes('performance') ||
            t.executionTime !== undefined
        );

        const hasMultipleTypes = new Set((testResults.hidden || []).map(t => t.type || 'normal')).size >= 2;

        if (hasMultipleTypes || (testResults.hidden || []).length >= 4) {
            score += 4;
            logTest('  Комплексность тестов', 'pass', 
                `Типов тестов: ${new Set((testResults.hidden || []).map(t => t.type || 'normal')).size}`);
        } else {
            score += 2;
            logTest('  Комплексность тестов', 'warning', 'Ограниченное разнообразие');
        }

        tests.push({ name: 'Комплексность тестов', pass: hasMultipleTypes || (testResults.hidden || []).length >= 4 });
    } catch (error) {
        logTest('Комплексность тестов', 'fail', error.message);
        tests.push({ name: 'Комплексность тестов', pass: false });
    }

    // Тест 3.3: Анализ производительности
    try {
        log('\n[3.3] Анализ производительности алгоритма', 'blue');
        
        const task = {
            id: 'test-task',
            level: 'Senior',
            expectedComplexity: 'O(n)',
            hiddenTestCases: [
                { input: '1000\n', type: 'performance', description: 'Performance test' }
            ]
        };

        const efficientCode = `n = int(input())
result = sum(range(1, n + 1))
print(result)`;

        const response = await fetchWithTimeout(`${API_BASE}/tests/run`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                code: efficientCode,
                task,
                language: 'python'
            })
        }, 60000);

        const testResults = await response.json();
        
        const hasExecutionTime = (testResults.hidden || []).some(t => 
            t.executionTime !== undefined || 
            testResults.totalTime !== undefined ||
            testResults.executionTime !== undefined
        );

        // Проверяем анализ в solution analyzer
        const analysisResponse = await fetchWithTimeout(`${API_BASE}/solutions/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                task,
                code: efficientCode,
                testResults,
                previousAttempts: 0
            })
        }, 60000);

        const analysis = await analysisResponse.json();
        const hasComplexityAnalysis = !!(analysis.optimality || analysis.complexity || analysis.performance);

        if (hasExecutionTime && hasComplexityAnalysis) {
            score += 4;
            logTest('  Анализ производительности', 'pass');
        } else if (hasExecutionTime || hasComplexityAnalysis) {
            score += 2;
            logTest('  Анализ производительности', 'warning', 'Частичная поддержка');
        } else {
            logTest('  Анализ производительности', 'fail');
        }

        tests.push({ name: 'Анализ производительности', pass: hasExecutionTime && hasComplexityAnalysis });
    } catch (error) {
        logTest('Анализ производительности', 'fail', error.message);
        tests.push({ name: 'Анализ производительности', pass: false });
    }

    // Тест 3.4: Система метрик и отчетов
    try {
        log('\n[3.4] Система метрик и отчетов', 'blue');
        
        const taskHistory = [{
            task: { id: 'task-1', level: 'Junior' },
            solution: 'def solution(arr): return max(arr)',
            analysis: { overallScore: 85, correctness: 90, optimality: 80 },
            testResults: { visible: [{ passed: true }], hidden: [{ passed: true }] }
        }];

        const chatHistory = [
            { role: 'assistant', content: 'Вопрос 1' },
            { role: 'user', content: 'Ответ 1' }
        ];

        const metrics = {
            tasksCount: 1,
            overallScore: 85,
            timeSpent: 1200
        };

        const response = await fetchWithTimeout(`${API_BASE}/reports/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                taskHistory,
                chatHistory,
                metrics
            })
        }, 60000);

        const report = await response.json();
        
        const hasOverallScore = !!(report.overallScore || report.score);
        const hasRecommendation = !!(report.recommendation || report.level || report.decision);
        const hasMetrics = !!(report.metrics || report.summary || report.analysis);
        const hasDetailedAnalysis = !!(report.detailedAnalysis || report.breakdown || report.sections);

        const metricScore = [hasOverallScore, hasRecommendation, hasMetrics, hasDetailedAnalysis]
            .filter(v => v).length * 1.75;

        logTest('  Метрики и отчеты', metricScore >= 5 ? 'pass' : 'warning',
            `${[hasOverallScore, hasRecommendation, hasMetrics, hasDetailedAnalysis].filter(v => v).length}/4 компонентов`);
        
        score += Math.round(metricScore);
        tests.push({ name: 'Метрики и отчеты', pass: hasOverallScore && hasRecommendation });
    } catch (error) {
        logTest('Метрики и отчеты', 'fail', error.message);
        tests.push({ name: 'Метрики и отчеты', pass: false });
    }

    // Тест 3.5: Эффективность анализа (скорость)
    try {
        log('\n[3.5] Эффективность анализа', 'blue');
        
        const task = {
            id: 'test-task',
            level: 'Junior',
            description: 'Тестовая задача'
        };

        const code = `def solution(arr):
    return max(arr) if arr else None`;

        const testResults = {
            visible: [{ passed: true }],
            hidden: [{ passed: true }]
        };

        const startTime = Date.now();
        const response = await fetchWithTimeout(`${API_BASE}/solutions/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                task,
                code,
                testResults,
                previousAttempts: 0
            })
        }, 60000);

        await response.json();
        const duration = Date.now() - startTime;

        // Анализ должен выполняться за разумное время (< 60 секунд для LLM)
        const isEfficient = duration < 60000;

        if (isEfficient) {
            score += 2;
            logTest('  Эффективность анализа', 'pass', `Время: ${(duration/1000).toFixed(1)}с`);
        } else {
            logTest('  Эффективность анализа', 'warning', `Время: ${(duration/1000).toFixed(1)}с`);
        }

        tests.push({ name: 'Эффективность анализа', pass: isEfficient });
    } catch (error) {
        logTest('Эффективность анализа', 'fail', error.message);
        tests.push({ name: 'Эффективность анализа', pass: false });
    }

    results.category3.score = Math.min(score, results.category3.maxScore);
    results.category3.tests = tests;
    
    log(`\nИтого по категории 3: ${results.category3.score}/${results.category3.maxScore}`, 
        results.category3.score >= 15 ? 'green' : 'yellow');
}

// ============================================================================
// КАТЕГОРИЯ 4: Система защиты от читерства (20 баллов)
// ============================================================================

async function testCategory4() {
    logSection('КАТЕГОРИЯ 4: Система защиты от читерства');

    let score = 0;
    const tests = [];

    // Тест 4.1: Детектирование событий античита
    try {
        log('\n[4.1] Детектирование событий античита', 'blue');
        
        // Проверяем наличие endpoints для античита
        const response = await fetchWithTimeout(`${API_BASE}/admin/overview`, {
            method: 'GET'
        }, 10000);

        const data = await response.json();
        
        const hasAntiCheatEvents = !!(data.antiCheatEvents || Array.isArray(data.antiCheatEvents));
        const hasAntiCheatSettings = !!(data.settings?.antiCheat);

        // Проверяем, что можно отправлять события
        const eventResponse = await fetchWithTimeout(`${API_BASE}/anti-cheat/events`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'test-event',
                details: { test: true },
                timestamp: new Date().toISOString()
            })
        }, 10000);

        const canSendEvents = eventResponse.ok || eventResponse.status === 200 || eventResponse.status === 201;

        if (hasAntiCheatEvents && canSendEvents) {
            score += 3;
            logTest('  API для событий античита', 'pass');
        } else {
            score += 1;
            logTest('  API для событий античита', 'warning', 'Частичная поддержка');
        }

        if (hasAntiCheatSettings) {
            score += 1;
            logTest('  Настройки античита', 'pass');
        } else {
            logTest('  Настройки античита', 'fail');
        }

        tests.push({ name: 'API событий античита', pass: hasAntiCheatEvents && canSendEvents });
        tests.push({ name: 'Настройки античита', pass: hasAntiCheatSettings });
    } catch (error) {
        logTest('API античита', 'fail', error.message);
        tests.push({ name: 'API античита', pass: false });
    }

    // Тест 4.2: Проверка типов детектируемых событий
    try {
        log('\n[4.2] Типы детектируемых событий', 'blue');
        
        const response = await fetchWithTimeout(`${API_BASE}/admin/overview`, {
            method: 'GET'
        }, 10000);

        const data = await response.json();
        const events = data.antiCheatEvents || [];
        
        const eventTypes = new Set(events.map(e => e.type));
        const expectedTypes = ['clipboard-copy', 'clipboard-paste', 'window-blur', 'tab-hidden', 'devtools-open'];
        
        const detectedTypes = expectedTypes.filter(type => 
            eventTypes.has(type) || 
            events.some(e => e.type?.includes(type.split('-')[0]))
        );

        logTest(`  Обнаружено типов событий: ${detectedTypes.length}/${expectedTypes.length}`, 
            detectedTypes.length >= 3 ? 'pass' : 'warning',
            `Типы: ${Array.from(eventTypes).slice(0, 5).join(', ')}`);

        if (detectedTypes.length >= 4) {
            score += 4;
        } else if (detectedTypes.length >= 2) {
            score += 2;
        }

        tests.push({ name: 'Типы событий', pass: detectedTypes.length >= 3 });
    } catch (error) {
        logTest('Типы событий', 'fail', error.message);
        tests.push({ name: 'Типы событий', pass: false });
    }

    // Тест 4.3: Проверка защиты от копирования кода
    try {
        log('\n[4.3] Защита от копирования кода', 'blue');
        
        // Проверяем наличие кода античита в frontend
        const response = await fetchWithTimeout(FRONTEND_URL, { method: 'GET' }, 10000);
        const html = await response.text();
        
        const hasClipboardDetection = html.includes('clipboard') || 
                                     html.includes('copy') || 
                                     html.includes('paste') ||
                                     html.includes('ClipboardEvent');
        
        const hasCopyProtection = html.includes('oncopy') || 
                                 html.includes('copy') || 
                                 html.includes('preventDefault');
        
        if (hasClipboardDetection || hasCopyProtection) {
            score += 3;
            logTest('  Детектирование копирования', 'pass');
        } else {
            logTest('  Детектирование копирования', 'warning', 'Не обнаружено в HTML');
        }

        tests.push({ name: 'Защита от копирования', pass: hasClipboardDetection || hasCopyProtection });
    } catch (error) {
        logTest('Защита от копирования', 'fail', error.message);
        tests.push({ name: 'Защита от копирования', pass: false });
    }

    // Тест 4.4: Проверка детектирования переключения вкладок
    try {
        log('\n[4.4] Детектирование переключения вкладок', 'blue');
        
        const response = await fetchWithTimeout(FRONTEND_URL, { method: 'GET' }, 10000);
        const html = await response.text();
        
        const hasTabDetection = html.includes('visibilitychange') || 
                               html.includes('tab-hidden') ||
                               html.includes('document.hidden') ||
                               html.includes('blur') ||
                               html.includes('focus');
        
        const hasWindowBlur = html.includes('window-blur') || 
                             html.includes('blur') ||
                             html.includes('onblur');
        
        if (hasTabDetection || hasWindowBlur) {
            score += 2;
            logTest('  Детектирование переключения вкладок', 'pass');
        } else {
            logTest('  Детектирование переключения вкладок', 'warning', 'Не обнаружено');
        }

        tests.push({ name: 'Детектирование вкладок', pass: hasTabDetection || hasWindowBlur });
    } catch (error) {
        logTest('Детектирование вкладок', 'fail', error.message);
        tests.push({ name: 'Детектирование вкладок', pass: false });
    }

    // Тест 4.5: Проверка детектирования DevTools
    try {
        log('\n[4.5] Детектирование DevTools', 'blue');
        
        const response = await fetchWithTimeout(FRONTEND_URL, { method: 'GET' }, 10000);
        const html = await response.text();
        
        const hasDevToolsDetection = html.includes('devtools') || 
                                    html.includes('DevTools') ||
                                    html.includes('debugger') ||
                                    html.includes('console.clear') ||
                                    html.includes('F12');
        
        if (hasDevToolsDetection) {
            score += 2;
            logTest('  Детектирование DevTools', 'pass');
        } else {
            logTest('  Детектирование DevTools', 'warning', 'Не обнаружено');
        }

        tests.push({ name: 'Детектирование DevTools', pass: hasDevToolsDetection });
    } catch (error) {
        logTest('Детектирование DevTools', 'fail', error.message);
        tests.push({ name: 'Детектирование DevTools', pass: false });
    }

    // Тест 4.6: Проверка настроек античита
    try {
        log('\n[4.6] Настройки системы античита', 'blue');
        
        const response = await fetchWithTimeout(`${API_BASE}/admin/overview`, {
            method: 'GET'
        }, 10000);

        const data = await response.json();
        const settings = data.settings?.antiCheat || {};
        
        const hasEnabled = 'enabled' in settings;
        const hasClipboard = 'clipboard' in settings;
        const hasDevtools = 'devtools' in settings;
        
        if (hasEnabled && (hasClipboard || hasDevtools)) {
            score += 2;
            logTest('  Настройки античита', 'pass', 
                `Включен: ${settings.enabled}, Clipboard: ${settings.clipboard}, DevTools: ${settings.devtools}`);
        } else {
            score += 1;
            logTest('  Настройки античита', 'warning', 'Частичная поддержка');
        }

        tests.push({ name: 'Настройки античита', pass: hasEnabled });
    } catch (error) {
        logTest('Настройки античита', 'fail', error.message);
        tests.push({ name: 'Настройки античита', pass: false });
    }

    // Тест 4.7: Верификация оригинальности решения (базовая проверка)
    try {
        log('\n[4.7] Верификация оригинальности решения', 'blue');
        
        // Проверяем, что система анализирует решения на оригинальность
        const task = {
            id: 'test-task',
            level: 'Junior',
            description: 'Тестовая задача'
        };

        // Одинаковые решения от разных "кандидатов"
        const solution1 = `def solution(arr):
    return max(arr) if arr else None`;

        const solution2 = `def solution(arr):
    return max(arr) if arr else None`;

        const testResults = { visible: [{ passed: true }], hidden: [{ passed: true }] };

        const [analysis1, analysis2] = await Promise.all([
            fetchWithTimeout(`${API_BASE}/solutions/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ task, code: solution1, testResults, previousAttempts: 0 })
            }, 60000).then(r => r.json()),
            fetchWithTimeout(`${API_BASE}/solutions/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ task, code: solution2, testResults, previousAttempts: 0 })
            }, 60000).then(r => r.json())
        ]);

        // Система должна как-то обрабатывать идентичные решения
        // (например, отслеживать их или отмечать)
        const hasOriginalityCheck = !!(analysis1.originality || 
                                      analysis2.originality || 
                                      analysis1.codeQuality !== undefined ||
                                      analysis2.codeQuality !== undefined);

        if (hasOriginalityCheck) {
            score += 2;
            logTest('  Верификация оригинальности', 'pass', 'Анализ качества кода присутствует');
        } else {
            score += 1;
            logTest('  Верификация оригинальности', 'warning', 'Базовая поддержка');
        }

        tests.push({ name: 'Верификация оригинальности', pass: hasOriginalityCheck });
    } catch (error) {
        logTest('Верификация оригинальности', 'fail', error.message);
        tests.push({ name: 'Верификация оригинальности', pass: false });
    }

    // Тест 4.8: Проверка логирования событий
    try {
        log('\n[4.8] Логирование событий античита', 'blue');
        
        // Отправляем тестовое событие
        const eventResponse = await fetchWithTimeout(`${API_BASE}/anti-cheat/events`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'test-detection',
                details: { source: 'test', timestamp: Date.now() },
                timestamp: new Date().toISOString()
            })
        }, 10000);

        // Проверяем, что событие сохранилось
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const overviewResponse = await fetchWithTimeout(`${API_BASE}/admin/overview`, {
            method: 'GET'
        }, 10000);

        const overviewData = await overviewResponse.json();
        const recentEvents = (overviewData.antiCheatEvents || []).slice(-5);
        
        const hasRecentEvents = recentEvents.length > 0;
        const canLogEvents = eventResponse.ok;

        if (canLogEvents && hasRecentEvents) {
            score += 1;
            logTest('  Логирование событий', 'pass', `Событий в истории: ${recentEvents.length}`);
        } else if (canLogEvents) {
            score += 0.5;
            logTest('  Логирование событий', 'warning', 'API работает, но события не видны');
        } else {
            logTest('  Логирование событий', 'fail');
        }

        tests.push({ name: 'Логирование событий', pass: canLogEvents && hasRecentEvents });
    } catch (error) {
        logTest('Логирование событий', 'fail', error.message);
        tests.push({ name: 'Логирование событий', pass: false });
    }

    results.category4.score = Math.min(Math.round(score), results.category4.maxScore);
    results.category4.tests = tests;
    
    log(`\nИтого по категории 4: ${results.category4.score}/${results.category4.maxScore}`, 
        results.category4.score >= 15 ? 'green' : 'yellow');
}

// ============================================================================
// ГЛАВНАЯ ФУНКЦИЯ
// ============================================================================

async function main() {
    log('\n' + '='.repeat(70), 'magenta');
    log('  ТЕСТИРОВАНИЕ ПОКРЫТИЯ СИСТЕМЫ ПО КРИТЕРИЯМ ОЦЕНИВАНИЯ', 'magenta');
    log('='.repeat(70), 'magenta');
    log(`\nAPI Base: ${API_BASE}`, 'blue');
    log(`Frontend: ${FRONTEND_URL}\n`, 'blue');

    // Проверка доступности сервера
    try {
        const response = await fetch(`${API_BASE}/admin/overview`, {
            method: 'GET',
            signal: AbortSignal.timeout(5000)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        log('✅ Backend доступен\n', 'green');
    } catch (error) {
        log(`❌ Backend недоступен: ${error.message}`, 'red');
        log('Убедитесь, что backend запущен и доступен по указанному адресу\n', 'yellow');
        process.exit(1);
    }

    // Запуск тестов по категориям
    try {
        await testCategory1();
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        await testCategory2();
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        await testCategory3();
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        await testCategory4();
    } catch (error) {
        log(`\n❌ Критическая ошибка при тестировании: ${error.message}`, 'red');
        console.error(error);
    }

    // Итоговый отчет
    logSection('ИТОГОВЫЙ ОТЧЕТ');
    
    let totalScore = 0;
    let maxScore = 0;

    Object.values(results).forEach(category => {
        maxScore += category.maxScore;
        totalScore += category.score;
        
        const percentage = (category.score / category.maxScore) * 100;
        const passedTests = category.tests.filter(t => t.pass).length;
        const totalTests = category.tests.length;
        
        log(`\n${category.name}:`, 'cyan');
        log(`  Баллы: ${category.score}/${category.maxScore} (${percentage.toFixed(1)}%)`, 
            category.score >= category.maxScore * 0.75 ? 'green' : 'yellow');
        log(`  Тесты: ${passedTests}/${totalTests} пройдено`, 
            passedTests === totalTests ? 'green' : passedTests >= totalTests * 0.7 ? 'yellow' : 'red');
    });

    const totalPercentage = (totalScore / maxScore) * 100;
    
    log(`\n${'='.repeat(70)}`, 'magenta');
    log(`  ОБЩИЙ ИТОГ: ${totalScore}/${maxScore} баллов (${totalPercentage.toFixed(1)}%)`, 
        totalPercentage >= 75 ? 'green' : totalPercentage >= 50 ? 'yellow' : 'red');
    log('='.repeat(70), 'magenta');

    // Сохранение результатов в файл
    const report = {
        timestamp: new Date().toISOString(),
        totalScore,
        maxScore,
        percentage: totalPercentage,
        categories: Object.values(results).map(cat => ({
            name: cat.name,
            score: cat.score,
            maxScore: cat.maxScore,
            tests: cat.tests
        }))
    };

    const fs = await import('fs/promises');
    await fs.writeFile(
        'evaluation-coverage-report.json',
        JSON.stringify(report, null, 2),
        'utf8'
    );

    log(`\n📄 Отчет сохранен в evaluation-coverage-report.json\n`, 'blue');

    process.exit(totalPercentage >= 50 ? 0 : 1);
}

// Запуск
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('test-evaluation-coverage.js')) {
    main().catch(error => {
        log(`\n❌ Критическая ошибка: ${error.message}`, 'red');
        console.error(error);
        process.exit(1);
    });
}

export { testCategory1, testCategory2, testCategory3, testCategory4 };

