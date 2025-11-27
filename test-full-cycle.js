#!/usr/bin/env node

/**
 * Тест полного цикла работы системы для всех уровней
 * Проверяет: генерацию задач, анализ решений, оценку ответов, генерацию отчетов
 */

import { fileURLToPath } from 'url';
import { pathToFileURL } from 'url';

const API_BASE = 'http://localhost:3000/api';

// Простые решения для тестирования
const testSolutions = {
    Junior: `def solution(arr):
    if not arr:
        return None
    max_val = arr[0]
    for num in arr:
        if num > max_val:
            max_val = num
    return max_val`,

    Middle: `def solution(arr):
    if not arr:
        return None
    
    def merge(left, right):
        result = []
        i = j = 0
        while i < len(left) and j < len(right):
            if left[i] <= right[j]:
                result.append(left[i])
                i += 1
            else:
                result.append(right[j])
                j += 1
        result.extend(left[i:])
        result.extend(right[j:])
        return result
    
    def merge_sort(arr):
        if len(arr) <= 1:
            return arr
        mid = len(arr) // 2
        left = merge_sort(arr[:mid])
        right = merge_sort(arr[mid:])
        return merge(left, right)
    
    sorted_arr = merge_sort(arr)
    return sorted_arr[-1] if sorted_arr else None`,

    Senior: `def solution(arr):
    if not arr:
        return None
    
    # Используем алгоритм "разделяй и властвуй"
    def find_max_recursive(arr, left, right):
        if left == right:
            return arr[left]
        mid = (left + right) // 2
        max_left = find_max_recursive(arr, left, mid)
        max_right = find_max_recursive(arr, mid + 1, right)
        return max(max_left, max_right)
    
    return find_max_recursive(arr, 0, len(arr) - 1)`
};

// Типичные ответы на вопросы
const testAnswers = {
    Junior: "Я выбрал простой линейный алгоритм с временной сложностью O(n), так как он эффективен для данной задачи и легко понимается.",
    Middle: "Использовал алгоритм разделения и завоевания с временной сложностью O(n log n), что оптимально для обработки больших массивов.",
    Senior: "Применил рекурсивный подход с разделением массива пополам, что дает логарифмическую сложность по пространству и линейную по времени."
};

// Цвета для консоли
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logStep(step, message) {
    log(`\n[${step}] ${message}`, 'cyan');
}

function logSuccess(message) {
    log(`✅ ${message}`, 'green');
}

function logError(message) {
    log(`❌ ${message}`, 'red');
}

function logWarning(message) {
    log(`⚠️  ${message}`, 'yellow');
}

// Функция для выполнения HTTP запроса
async function fetchWithTimeout(url, options = {}, timeoutMs = 120000) {
    // Проверяем, если третий параметр - это объект (старый формат), используем его как options
    let actualOptions = options;
    let actualTimeout = timeoutMs;
    
    if (typeof options === 'number') {
        actualTimeout = options;
        actualOptions = {};
    } else if (typeof timeoutMs !== 'number') {
        actualTimeout = 120000;
    }
    
    const timeout = typeof actualTimeout === 'number' && actualTimeout > 0 ? actualTimeout : 120000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
        const response = await fetch(url, {
            ...actualOptions,
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = `HTTP ${response.status}`;
            try {
                const errorJson = JSON.parse(errorText);
                errorMessage = errorJson.error || errorJson.message || errorMessage;
            } catch (e) {
                if (errorText) {
                    errorMessage = errorText.substring(0, 200);
                }
            }
            throw new Error(errorMessage);
        }
        
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error(`Таймаут запроса (${(timeout/1000).toFixed(0)}с)`);
        }
        if (error.message.includes('Failed to fetch') || error.message.includes('ECONNREFUSED')) {
            throw new Error('Не удалось подключиться к серверу. Убедитесь, что backend запущен на http://localhost:3000');
        }
        throw error;
    }
}

// Тест генерации задачи
async function testTaskGeneration(level) {
    logStep('ГЕНЕРАЦИЯ ЗАДАЧИ', `Уровень: ${level}`);
    
    try {
        const startTime = Date.now();
        const response = await fetchWithTimeout(`${API_BASE}/tasks/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                level: level,
                topic: 'algorithms',
                language: 'python'
            })
        }, 120000);
        
        const task = await response.json();
        const duration = Date.now() - startTime;
        
        // Проверяем структуру задачи
        const requiredFields = ['id', 'level', 'description'];
        const missingFields = requiredFields.filter(field => !task[field]);
        
        if (missingFields.length > 0) {
            throw new Error(`Отсутствуют обязательные поля: ${missingFields.join(', ')}`);
        }
        
        logSuccess(`Задача сгенерирована за ${(duration/1000).toFixed(1)}с`);
        log(`   ID: ${task.id}`, 'blue');
        log(`   Уровень: ${task.level}`, 'blue');
        log(`   Описание: ${task.description?.substring(0, 100)}...`, 'blue');
        
        return task;
    } catch (error) {
        logError(`Ошибка генерации задачи: ${error.message}`);
        throw error;
    }
}

// Тест запуска тестов
async function testRunTests(task, solution, level) {
    logStep('ЗАПУСК ТЕСТОВ', `Уровень: ${level}`);
    
    try {
        const startTime = Date.now();
        const response = await fetchWithTimeout(`${API_BASE}/tests/run`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                code: solution,
                task: task,
                language: 'python'
            })
        }, 120000);
        
        const testResults = await response.json();
        const duration = Date.now() - startTime;
        
        logSuccess(`Тесты выполнены за ${(duration/1000).toFixed(1)}с`);
        
        if (testResults.visible) {
            const passed = testResults.visible.filter(t => t.passed).length;
            log(`   Видимые тесты: ${passed}/${testResults.visible.length} пройдено`, 'blue');
        }
        
        return testResults;
    } catch (error) {
        logError(`Ошибка запуска тестов: ${error.message}`);
        throw error;
    }
}

// Тест анализа решения
async function testSolutionAnalysis(task, solution, testResults, level) {
    logStep('АНАЛИЗ РЕШЕНИЯ', `Уровень: ${level}`);
    
    try {
        const startTime = Date.now();
        const response = await fetchWithTimeout(`${API_BASE}/solutions/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                task: task,
                code: solution,
                testResults: testResults,
                previousAttempts: 0
            })
        }, 120000);
        
        const analysis = await response.json();
        const duration = Date.now() - startTime;
        
        // Проверяем структуру анализа
        if (!analysis.overallScore && analysis.overallScore !== 0 && !analysis.score && analysis.score !== 0) {
            logWarning('Отсутствует общая оценка, но анализ получен');
        }
        
        logSuccess(`Анализ выполнен за ${(duration/1000).toFixed(1)}с`);
        log(`   Оценка: ${analysis.overallScore || analysis.score || 'N/A'}`, 'blue');
        log(`   Корректность: ${analysis.correctness || 'N/A'}`, 'blue');
        log(`   Оптимальность: ${analysis.optimality || 'N/A'}`, 'blue');
        log(`   Качество кода: ${analysis.codeQuality || 'N/A'}`, 'blue');
        
        return analysis;
    } catch (error) {
        logError(`Ошибка анализа: ${error.message}`);
        throw error;
    }
}

// Тест генерации вопроса
async function testQuestionGeneration(task, solution, analysis, level) {
    logStep('ГЕНЕРАЦИЯ ВОПРОСА', `Уровень: ${level}`);
    
    try {
        const startTime = Date.now();
        const response = await fetchWithTimeout(`${API_BASE}/chat/question`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                task: task,
                solution: solution,
                analysis: analysis
            })
        }, 120000);
        
        const data = await response.json();
        const duration = Date.now() - startTime;
        
        if (!data.question) {
            throw new Error('Отсутствует вопрос');
        }
        
        // Очищаем вопрос от reasoning тегов
        let cleanQuestion = data.question || '';
        cleanQuestion = cleanQuestion.replace(/<think>[\s\S]*?<\/redacted_reasoning>/gi, '');
        cleanQuestion = cleanQuestion.replace(/<think>[\s\S]*?<\/think>/gi, '');
        cleanQuestion = cleanQuestion.trim();
        
        logSuccess(`Вопрос сгенерирован за ${(duration/1000).toFixed(1)}с`);
        log(`   Вопрос: ${cleanQuestion.substring(0, 100)}...`, 'blue');
        
        return cleanQuestion || data.question;
    } catch (error) {
        logError(`Ошибка генерации вопроса: ${error.message}`);
        throw error;
    }
}

// Тест оценки ответа
async function testAnswerEvaluation(question, answer, solution, level) {
    logStep('ОЦЕНКА ОТВЕТА', `Уровень: ${level}`);
    
    try {
        const startTime = Date.now();
        const response = await fetchWithTimeout(`${API_BASE}/chat/evaluate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                question: question,
                answer: answer,
                solution: solution
            })
        }, 120000);
        
        const evaluation = await response.json();
        const duration = Date.now() - startTime;
        
        logSuccess(`Оценка выполнена за ${(duration/1000).toFixed(1)}с`);
        log(`   Понимание: ${evaluation.understanding || 'N/A'}`, 'blue');
        log(`   Коммуникация: ${evaluation.communication || 'N/A'}`, 'blue');
        
        return evaluation;
    } catch (error) {
        logError(`Ошибка оценки: ${error.message}`);
        throw error;
    }
}

// Тест генерации отчета
async function testReportGeneration(taskHistory, chatHistory, metrics, level) {
    logStep('ГЕНЕРАЦИЯ ОТЧЕТА', `Уровень: ${level}`);
    
    try {
        const startTime = Date.now();
        const response = await fetchWithTimeout(`${API_BASE}/reports/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                taskHistory: taskHistory,
                chatHistory: chatHistory,
                metrics: metrics
            })
        }, 120000);
        
        const report = await response.json();
        const duration = Date.now() - startTime;
        
        logSuccess(`Отчет сгенерирован за ${(duration/1000).toFixed(1)}с`);
        log(`   Общая оценка: ${report.overallScore ?? report.score ?? 'N/A'}`, 'blue');
        log(`   Рекомендация: ${report.recommendation || report.level || 'N/A'}`, 'blue');
        
        // Не считаем отсутствие оценки критической ошибкой
        if (!report.overallScore && report.overallScore !== 0 && !report.score && report.score !== 0) {
            logWarning('Отчет сгенерирован, но общая оценка отсутствует');
        }
        
        return report;
    } catch (error) {
        logError(`Ошибка генерации отчета: ${error.message}`);
        throw error;
    }
}

// Полный тест для одного уровня
async function testLevel(level) {
    log(`\n${'='.repeat(60)}`, 'yellow');
    log(`ТЕСТИРОВАНИЕ УРОВНЯ: ${level}`, 'yellow');
    log('='.repeat(60), 'yellow');
    
    const results = {
        level: level,
        success: true,
        errors: [],
        timings: {}
    };
    
    try {
        // 1. Генерация задачи
        const taskStart = Date.now();
        const task = await testTaskGeneration(level);
        results.timings.taskGeneration = Date.now() - taskStart;
        
        // 2. Запуск тестов
        const testsStart = Date.now();
        const solution = testSolutions[level];
        const testResults = await testRunTests(task, solution, level);
        results.timings.testRun = Date.now() - testsStart;
        
        // 3. Анализ решения
        const analysisStart = Date.now();
        const analysis = await testSolutionAnalysis(task, solution, testResults, level);
        results.timings.analysis = Date.now() - analysisStart;
        
        // 4. Генерация вопроса
        const questionStart = Date.now();
        const question = await testQuestionGeneration(task, solution, analysis, level);
        results.timings.questionGeneration = Date.now() - questionStart;
        
        // 5. Оценка ответа
        const evaluationStart = Date.now();
        const answer = testAnswers[level];
        const evaluation = await testAnswerEvaluation(question, answer, solution, level);
        results.timings.evaluation = Date.now() - evaluationStart;
        
        // 6. Генерация отчета
        const reportStart = Date.now();
        const taskHistory = [{
            task: task,
            solution: solution,
            analysis: analysis,
            testResults: testResults,
            score: analysis.overallScore || analysis.score || 0
        }];
        const chatHistory = [
            { role: 'assistant', content: question },
            { role: 'user', content: answer }
        ];
        const metrics = {
            tasksCount: 1,
            overallScore: analysis.score || analysis.overallScore || 0,
            timeSpent: 0
        };
        try {
            const report = await testReportGeneration(taskHistory, chatHistory, metrics, level);
            results.timings.reportGeneration = Date.now() - reportStart;
            results.report = report;
        } catch (reportError) {
            logWarning(`Генерация отчета не удалась: ${reportError.message}, но это некритично`);
            results.timings.reportGeneration = Date.now() - reportStart;
            // Не считаем ошибку отчета критической
        }
        
        logSuccess(`\n✅ Все основные тесты для уровня ${level} пройдены успешно!`);
        
    } catch (error) {
        results.success = false;
        results.errors.push(error.message);
        logError(`\n❌ Тесты для уровня ${level} завершились с ошибками: ${error.message}`);
        // Показываем стек для отладки
        if (error.stack) {
            console.error(error.stack);
        }
    }
    
    return results;
}

// Проверка доступности сервера
async function checkServer() {
    logStep('ПРОВЕРКА СЕРВЕРА', 'Проверка доступности backend');
    
    try {
        const response = await fetch(`${API_BASE}/admin/overview`, {
            method: 'GET',
            signal: AbortSignal.timeout(5000)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        logSuccess('Backend доступен');
        return true;
    } catch (error) {
        logError(`Backend недоступен: ${error.message}`);
        logWarning('Убедитесь, что backend запущен на http://localhost:3000');
        return false;
    }
}

// Главная функция
async function main() {
    log('\n' + '='.repeat(60), 'cyan');
    log('ТЕСТИРОВАНИЕ ПОЛНОГО ЦИКЛА РАБОТЫ СИСТЕМЫ', 'cyan');
    log('='.repeat(60), 'cyan');
    
    // Проверяем доступность сервера
    const serverAvailable = await checkServer();
    if (!serverAvailable) {
        process.exit(1);
    }
    
    const levels = ['Junior', 'Middle', 'Senior'];
    const allResults = [];
    
    // Тестируем каждый уровень
    for (const level of levels) {
        try {
            const result = await testLevel(level);
            allResults.push(result);
            
            // Небольшая задержка между уровнями
            if (level !== levels[levels.length - 1]) {
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        } catch (error) {
            logError(`Критическая ошибка при тестировании уровня ${level}: ${error.message}`);
            allResults.push({
                level: level,
                success: false,
                errors: [error.message]
            });
        }
    }
    
    // Итоговый отчет
    log('\n' + '='.repeat(60), 'cyan');
    log('ИТОГОВЫЙ ОТЧЕТ', 'cyan');
    log('='.repeat(60), 'cyan');
    
    const successCount = allResults.filter(r => r.success).length;
    const totalCount = allResults.length;
    
    log(`\nУспешно пройдено: ${successCount}/${totalCount} уровней`, 
        successCount === totalCount ? 'green' : 'yellow');
    
    allResults.forEach(result => {
        if (result.success) {
            log(`\n✅ ${result.level}:`, 'green');
            if (result.timings) {
                const totalTime = Object.values(result.timings).reduce((a, b) => a + b, 0);
                log(`   Общее время: ${(totalTime/1000).toFixed(1)}с`, 'blue');
                Object.entries(result.timings).forEach(([key, time]) => {
                    log(`   ${key}: ${(time/1000).toFixed(1)}с`, 'blue');
                });
            }
        } else {
            log(`\n❌ ${result.level}:`, 'red');
            result.errors.forEach(error => {
                log(`   ${error}`, 'red');
            });
        }
    });
    
    log('\n' + '='.repeat(60), 'cyan');
    
    // Возвращаем код выхода
    process.exit(successCount === totalCount ? 0 : 1);
}

// Запуск при прямом вызове
const __filename = fileURLToPath(import.meta.url);
const isMainModule = process.argv[1] === __filename || 
                     process.argv[1]?.endsWith('test-full-cycle.js');

if (isMainModule) {
    main().catch(error => {
        logError(`Критическая ошибка: ${error.message}`);
        console.error(error);
        process.exit(1);
    });
}

export { testLevel, checkServer };

