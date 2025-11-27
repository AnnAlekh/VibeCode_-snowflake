#!/usr/bin/env node

/**
 * Автоматизированное тестирование платформы AI Interviewer
 * Проверяет основные функции согласно TEST_SCENARIO.md
 */

import http from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const API_BASE = 'http://localhost:3000';
const TEST_TIMEOUT = 30000;

const results = {
    total: 0,
    passed: 0,
    failed: 0,
    tests: []
};

function log(message, type = 'info') {
    const colors = {
        info: '\x1b[36m',
        success: '\x1b[32m',
        error: '\x1b[31m',
        warning: '\x1b[33m',
        reset: '\x1b[0m'
    };
    const emoji = {
        info: 'ℹ️',
        success: '✅',
        error: '❌',
        warning: '⚠️'
    };
    console.log(`${colors[type]}${emoji[type]} ${message}${colors.reset}`);
}

function testResult(name, passed, message, details = null) {
    results.total++;
    if (passed) {
        results.passed++;
        log(`[PASS] ${name}: ${message}`, 'success');
    } else {
        results.failed++;
        log(`[FAIL] ${name}: ${message}`, 'error');
        if (details) {
            console.log(`   Детали: ${JSON.stringify(details, null, 2)}`);
        }
    }
    results.tests.push({ name, passed, message, details });
}

async function httpRequest(method, path, data = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, API_BASE);
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: TEST_TIMEOUT
        };

        const req = http.request(url, options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                try {
                    const parsed = body ? JSON.parse(body) : null;
                    resolve({ status: res.statusCode, data: parsed, headers: res.headers });
                } catch (e) {
                    resolve({ status: res.statusCode, data: body, headers: res.headers });
                }
            });
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });

        if (data) {
            req.write(JSON.stringify(data));
        }
        req.end();
    });
}

// ==========================================
// ТЕСТЫ
// ==========================================

async function testBackendConnection() {
    log('\n=== Проверка подключения к backend ===', 'info');
    try {
        // Пробуем любой эндпоинт для проверки доступности
        const response = await httpRequest('GET', '/');
        testResult('Backend Connection', response.status !== undefined, 
            `Backend отвечает (статус: ${response.status})`);
        return response.status !== undefined;
    } catch (error) {
        testResult('Backend Connection', false, `Backend недоступен: ${error.message}`);
        return false;
    }
}

async function testTaskGeneration() {
    log('\n=== Тест генерации задачи ===', 'info');
    try {
        const response = await httpRequest('POST', '/api/tasks/generate', {
            level: 'Junior',
            topic: 'Algorithms'
        });
        
        // В ответе приходит сам объект задачи, а не обернутый в task
        const passed = response.status === 200 && response.data && (response.data.id || response.data.description);
        testResult('Task Generation', passed, 
            passed ? 'Задача успешно сгенерирована' : `Ошибка: статус ${response.status}`,
            passed ? { taskId: response.data.id, description: response.data.description?.substring(0, 50) } : response.data);
        return passed;
    } catch (error) {
        testResult('Task Generation', false, `Ошибка: ${error.message}`);
        return false;
    }
}

async function testCodeExecution() {
    log('\n=== Тест выполнения кода ===', 'info');
    try {
        const response = await httpRequest('POST', '/api/runtime/run', {
            code: 'def solution(x):\n    return x * 2',
            language: 'python',
            input: '5'
        });
        
        const passed = response.status === 200 && response.data;
        testResult('Code Execution', passed,
            passed ? 'Код успешно выполнен' : `Ошибка: статус ${response.status}`,
            response.data);
        return passed;
    } catch (error) {
        testResult('Code Execution', false, `Ошибка: ${error.message}`);
        return false;
    }
}

async function testTestRunner() {
    log('\n=== Тест запуска тестов ===', 'info');
    try {
        const response = await httpRequest('POST', '/api/tests/run', {
            code: 'def solution(arr):\n    return sum(arr)',
            language: 'python',
            testCases: [
                { input: '[1, 2, 3]', expected: '6' },
                { input: '[5, 10]', expected: '15' }
            ]
        });
        
        const passed = response.status === 200 && response.data;
        testResult('Test Runner', passed,
            passed ? 'Тесты успешно запущены' : `Ошибка: статус ${response.status}`,
            response.data);
        return passed;
    } catch (error) {
        testResult('Test Runner', false, `Ошибка: ${error.message}`);
        return false;
    }
}

async function testSolutionAnalysis() {
    log('\n=== Тест анализа решения ===', 'info');
    try {
        const response = await httpRequest('POST', '/api/solutions/analyze', {
            code: 'def solution(x):\n    return x * 2',
            language: 'python',
            task: {
                description: 'Умножьте число на 2',
                visibleTestCases: [
                    { input: '5', output: '10' }
                ]
            },
            testResults: {
                visible: [
                    { passed: true, input: '5', expected: '10', actual: '10' }
                ],
                hidden: [],
                allPassed: true,
                visiblePassed: true
            }
        });
        
        const passed = response.status === 200 && response.data;
        testResult('Solution Analysis', passed,
            passed ? 'Решение успешно проанализировано' : `Ошибка: статус ${response.status}`,
            response.data);
        return passed;
    } catch (error) {
        testResult('Solution Analysis', false, `Ошибка: ${error.message}`);
        return false;
    }
}

async function testChatQuestion() {
    log('\n=== Тест генерации вопроса интервьюера ===', 'info');
    try {
        const response = await httpRequest('POST', '/api/chat/question', {
            level: 'Junior',
            solution: 'def solution(x): return x * 2',
            context: 'Первая задача решена'
        });
        
        const passed = response.status === 200 && response.data;
        testResult('Chat Question', passed,
            passed ? 'Вопрос успешно сгенерирован' : `Ошибка: статус ${response.status}`,
            response.data);
        return passed;
    } catch (error) {
        testResult('Chat Question', false, `Ошибка: ${error.message}`);
        return false;
    }
}

async function testReportGeneration() {
    log('\n=== Тест генерации отчета ===', 'info');
    try {
        const response = await httpRequest('POST', '/api/reports/generate', {
            taskHistory: [
                { 
                    id: 1, 
                    score: 85, 
                    timeSpent: 120,
                    task: { description: 'Тестовая задача' },
                    solution: 'def solution(x): return x * 2',
                    analysis: { overallScore: 85 }
                }
            ],
            chatHistory: [
                { role: 'interviewer', content: 'Вопрос 1' },
                { role: 'candidate', content: 'Ответ 1' }
            ],
            metrics: {
                overallScore: 85,
                tasksCount: 1,
                timeSpent: 120
            }
        });
        
        const passed = response.status === 200 && response.data;
        testResult('Report Generation', passed,
            passed ? 'Отчет успешно сгенерирован' : `Ошибка: статус ${response.status}`,
            response.data);
        return passed;
    } catch (error) {
        testResult('Report Generation', false, `Ошибка: ${error.message}`);
        return false;
    }
}

async function testAdminData() {
    log('\n=== Тест админ-данных ===', 'info');
    try {
        const fs = await import('fs');
        const adminDataPath = join(__dirname, 'ai-interviewer/src/data/admin-data.json');
        
        if (fs.existsSync(adminDataPath)) {
            const data = JSON.parse(fs.readFileSync(adminDataPath, 'utf-8'));
            const hasTasks = data.tasks && Array.isArray(data.tasks);
            const hasSettings = data.settings !== undefined;
            
            testResult('Admin Data', hasTasks && hasSettings,
                hasTasks && hasSettings ? 'Админ-данные корректны' : 'Админ-данные неполные',
                { tasksCount: hasTasks ? data.tasks.length : 0, hasSettings });
            return hasTasks && hasSettings;
        } else {
            testResult('Admin Data', false, 'Файл admin-data.json не найден');
            return false;
        }
    } catch (error) {
        testResult('Admin Data', false, `Ошибка: ${error.message}`);
        return false;
    }
}

async function testFileStructure() {
    log('\n=== Проверка структуры файлов ===', 'info');
    try {
        const fs = await import('fs');
        const requiredFiles = [
            'web-app/index.html',
            'web-app/app.js',
            'web-app/js/modules/logger.js',
            'web-app/js/modules/api.js',
            'web-app/test-scenario-runner.js',
            'web-app/test-runner.html',
            'ai-interviewer/src/server.js'
        ];

        let allExist = true;
        for (const file of requiredFiles) {
            const exists = fs.existsSync(join(__dirname, file));
            if (!exists) {
                log(`   ❌ Отсутствует: ${file}`, 'error');
                allExist = false;
            }
        }

        testResult('File Structure', allExist,
            allExist ? 'Все необходимые файлы на месте' : 'Некоторые файлы отсутствуют');
        return allExist;
    } catch (error) {
        testResult('File Structure', false, `Ошибка: ${error.message}`);
        return false;
    }
}

// ==========================================
// ГЛАВНАЯ ФУНКЦИЯ
// ==========================================

async function runAllTests() {
    console.log('\n🧪 ЗАПУСК АВТОМАТИЗИРОВАННОГО ТЕСТИРОВАНИЯ ПЛАТФОРМЫ\n');
    console.log('='.repeat(60));

    // Проверка структуры файлов
    await testFileStructure();

    // Проверка подключения
    const backendOk = await testBackendConnection();
    
    if (!backendOk) {
        log('\n⚠️  Backend недоступен. Некоторые тесты будут пропущены.', 'warning');
        log('   Убедитесь, что backend запущен: cd ai-interviewer && npm run server', 'warning');
    } else {
        // API тесты
        await testTaskGeneration();
        await testCodeExecution();
        await testTestRunner();
        await testSolutionAnalysis();
        await testChatQuestion();
        await testReportGeneration();
    }

    // Тесты данных
    await testAdminData();

    // Итоговый отчет
    console.log('\n' + '='.repeat(60));
    console.log('\n📊 ИТОГОВЫЙ ОТЧЕТ\n');
    
    const passRate = results.total > 0 ? ((results.passed / results.total) * 100).toFixed(1) : 0;
    
    log(`Всего тестов: ${results.total}`, 'info');
    log(`Пройдено: ${results.passed}`, 'success');
    log(`Провалено: ${results.failed}`, 'error');
    log(`Процент успеха: ${passRate}%`, passRate >= 80 ? 'success' : 'warning');

    // Сохранение результатов
    const fs = await import('fs');
    const resultsPath = join(__dirname, 'test-results.json');
    fs.writeFileSync(resultsPath, JSON.stringify({
        timestamp: new Date().toISOString(),
        ...results,
        passRate: parseFloat(passRate)
    }, null, 2));
    
    log(`\n💾 Результаты сохранены в: ${resultsPath}`, 'info');

    // Возвращаем код выхода
    process.exit(results.failed > 0 ? 1 : 0);
}

// Запуск
runAllTests().catch(error => {
    console.error('❌ Критическая ошибка:', error);
    process.exit(1);
});

