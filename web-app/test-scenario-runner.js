/**
 * Автоматизированный тестовый скрипт для TEST_SCENARIO.md
 * Запускается в браузере через консоль или как модуль
 * 
 * Использование:
 * 1. Откройте web-app/index.html в браузере
 * 2. Откройте консоль (F12)
 * 3. Выполните: import('./test-scenario-runner.js').then(m => m.runAllTests())
 * 
 * Или добавьте в index.html:
 * <script type="module" src="test-scenario-runner.js"></script>
 */

class TestScenarioRunner {
    constructor() {
        this.results = [];
        this.currentScenario = null;
        this.currentStep = null;
        this.waitTime = 2000; // Базовая задержка между действиями
    }

    // Утилиты для ожидания
    async wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async waitForElement(selector, timeout = 10000) {
        const startTime = Date.now();
        while (Date.now() - startTime < timeout) {
            const element = document.querySelector(selector);
            if (element) return element;
            await this.wait(100);
        }
        throw new Error(`Element not found: ${selector}`);
    }

    async waitForCondition(condition, timeout = 10000, checkInterval = 100) {
        const startTime = Date.now();
        while (Date.now() - startTime < timeout) {
            if (await condition()) return true;
            await this.wait(checkInterval);
        }
        throw new Error('Condition not met within timeout');
    }

    // Логирование результатов
    logResult(scenario, step, passed, message, details = null) {
        const result = {
            scenario,
            step,
            passed,
            message,
            details,
            timestamp: new Date().toISOString()
        };
        this.results.push(result);
        
        const emoji = passed ? '✅' : '❌';
        const color = passed ? 'color: green' : 'color: red';
        console.log(`%c${emoji} [${scenario}] ${step}: ${message}`, color, details || '');
        
        if (window.systemLogger) {
            window.systemLogger.log(
                passed ? 'system' : 'error',
                `Test: ${scenario} - ${step}`,
                { passed, message, details },
                passed ? 'success' : 'error'
            );
        }
    }

    // Проверка наличия логгера
    async checkLogger() {
        try {
            if (!window.systemLogger) {
                throw new Error('window.systemLogger не найден');
            }
            this.logResult('Setup', 'Logger Check', true, 'Логгер доступен');
            return true;
        } catch (error) {
            this.logResult('Setup', 'Logger Check', false, error.message);
            return false;
        }
    }

    // Проверка доступности backend
    async checkBackend() {
        try {
            const response = await fetch('http://localhost:3000/health', { 
                method: 'GET',
                signal: AbortSignal.timeout(5000)
            });
            const isOk = response.ok;
            this.logResult('Setup', 'Backend Check', isOk, 
                isOk ? 'Backend доступен' : `Backend вернул статус ${response.status}`);
            return isOk;
        } catch (error) {
            this.logResult('Setup', 'Backend Check', false, 
                `Backend недоступен: ${error.message}`);
            return false;
        }
    }

    // ==========================================
    // СЦЕНАРИЙ 1: Полный цикл интервью
    // ==========================================

    async scenario1_Step1_SelectLevel() {
        this.currentStep = 'Шаг 1: Выбор уровня';
        try {
            // Найти кнопку Junior
            const juniorBtn = await this.waitForElement('button.level-btn');
            if (!juniorBtn.textContent.includes('Junior')) {
                throw new Error('Кнопка Junior не найдена');
            }
            
            // Кликнуть на кнопку
            juniorBtn.click();
            await this.wait(this.waitTime);

            // Проверить переход на экран интервью
            const interviewScreen = document.getElementById('interview-screen');
            const isVisible = interviewScreen && interviewScreen.classList.contains('active');
            
            // Проверить наличие индикатора прогресса
            const progressBar = document.getElementById('progress-bar');
            const stageIndicator = document.getElementById('stage-indicator');
            
            const passed = isVisible && progressBar && stageIndicator;
            this.logResult('Сценарий 1', this.currentStep, passed,
                passed ? 'Экран переключен, элементы отображаются' : 'Элементы не найдены',
                { isVisible, hasProgressBar: !!progressBar, hasStageIndicator: !!stageIndicator }
            );

            // Проверить логи
            if (window.systemLogger) {
                const logs = window.systemLogger.getLogs({ 
                    category: 'user-action',
                    search: 'startInterview'
                });
                const hasLog = logs.length > 0;
                this.logResult('Сценарий 1', this.currentStep + ' (логи)', hasLog,
                    hasLog ? 'Действие залогировано' : 'Действие не залогировано');
            }

            return passed;
        } catch (error) {
            this.logResult('Сценарий 1', this.currentStep, false, error.message);
            return false;
        }
    }

    async scenario1_Step2_GenerateTask() {
        this.currentStep = 'Шаг 2: Генерация задачи';
        try {
            // Ждем появления задачи (это может занять время)
            await this.wait(3000); // Даем время на генерацию

            // Проверяем, что этап 1 активен
            const stage1 = document.getElementById('stage-1');
            const isActive = stage1 && stage1.classList.contains('active');
            
            // Проверяем наличие задачи
            const taskContainer = document.querySelector('.task-container, .task-panel');
            const hasTask = !!taskContainer;
            
            // Проверяем прогресс-бар
            const progressBar = document.getElementById('progress-bar');
            const progress = progressBar ? parseInt(progressBar.style.width) : 0;
            const progressOk = progress > 0 && progress <= 20;

            const passed = isActive && hasTask && progressOk;
            this.logResult('Сценарий 1', this.currentStep, passed,
                passed ? 'Задача сгенерирована, этап активен' : 'Задача не сгенерирована',
                { isActive, hasTask, progress }
            );

            // Проверяем логи
            if (window.systemLogger) {
                const logs = window.systemLogger.getLogs({ 
                    category: 'system',
                    search: 'task-generated'
                });
                this.logResult('Сценарий 1', this.currentStep + ' (логи)', logs.length > 0,
                    logs.length > 0 ? 'Событие task-generated залогировано' : 'Событие не найдено');
            }

            return passed;
        } catch (error) {
            this.logResult('Сценарий 1', this.currentStep, false, error.message);
            return false;
        }
    }

    async scenario1_Step3_WriteSolution() {
        this.currentStep = 'Шаг 3: Написание решения';
        try {
            // Проверяем наличие редактора Monaco
            // Monaco Editor создается асинхронно, поэтому проверяем через window
            await this.wait(2000);
            
            const hasEditor = typeof window.monaco !== 'undefined' || 
                             document.querySelector('.monaco-editor') !== null;
            
            if (!hasEditor) {
                // Пробуем найти редактор через другие селекторы
                const codeEditor = document.querySelector('#monaco-editor, .code-editor, textarea[placeholder*="код"]');
                const passed = !!codeEditor;
                this.logResult('Сценарий 1', this.currentStep, passed,
                    passed ? 'Редактор найден' : 'Редактор не найден');
                return passed;
            }

            // Пробуем изменить язык (если доступна функция)
            let languageChanged = false;
            if (typeof changeLanguage === 'function') {
                try {
                    changeLanguage('javascript');
                    await this.wait(500);
                    languageChanged = true;
                } catch (e) {
                    // Игнорируем ошибки смены языка
                }
            }

            this.logResult('Сценарий 1', this.currentStep, true,
                'Редактор доступен', { hasEditor, languageChanged });

            return true;
        } catch (error) {
            this.logResult('Сценарий 1', this.currentStep, false, error.message);
            return false;
        }
    }

    async scenario1_Step4_RunTests() {
        this.currentStep = 'Шаг 4: Запуск тестов';
        try {
            // Ищем кнопку "Запустить тесты"
            const runTestsBtn = Array.from(document.querySelectorAll('button'))
                .find(btn => btn.textContent.includes('Запустить тест') || 
                            btn.textContent.includes('Run Test') ||
                            btn.textContent.includes('Тест'));
            
            if (!runTestsBtn) {
                this.logResult('Сценарий 1', this.currentStep, false, 'Кнопка запуска тестов не найдена');
                return false;
            }

            // Кликаем на кнопку
            runTestsBtn.click();
            await this.wait(3000); // Ждем выполнения тестов

            // Проверяем наличие результатов тестов
            const testResults = document.querySelector('.test-results, .test-output, [class*="test"]');
            const hasResults = !!testResults;

            this.logResult('Сценарий 1', this.currentStep, hasResults,
                hasResults ? 'Тесты запущены, результаты отображаются' : 'Результаты тестов не найдены');

            // Проверяем логи API
            if (window.systemLogger) {
                const logs = window.systemLogger.getLogs({ 
                    category: 'api',
                    search: '/tests/run'
                });
                this.logResult('Сценарий 1', this.currentStep + ' (логи)', logs.length > 0,
                    logs.length > 0 ? 'API запрос залогирован' : 'API запрос не найден');
            }

            return hasResults;
        } catch (error) {
            this.logResult('Сценарий 1', this.currentStep, false, error.message);
            return false;
        }
    }

    async scenario1_Step5_ManualExecution() {
        this.currentStep = 'Шаг 5: Ручное выполнение кода';
        try {
            // Ищем поля для ввода данных и кнопку запуска
            const inputField = document.querySelector('input[placeholder*="данн"], textarea[placeholder*="данн"], #input-data');
            const runBtn = Array.from(document.querySelectorAll('button'))
                .find(btn => btn.textContent.includes('Запустить') && 
                            !btn.textContent.includes('тест'));
            const outputField = document.querySelector('#output, .output, [class*="output"]');

            if (!inputField || !runBtn) {
                this.logResult('Сценарий 1', this.currentStep, false, 
                    'Элементы для ручного выполнения не найдены');
                return false;
            }

            // Вводим тестовые данные
            inputField.value = '1 2 3';
            inputField.dispatchEvent(new Event('input', { bubbles: true }));
            await this.wait(500);

            // Кликаем на кнопку запуска
            runBtn.click();
            await this.wait(2000);

            // Проверяем наличие вывода
            const hasOutput = outputField && outputField.textContent.trim().length > 0;

            this.logResult('Сценарий 1', this.currentStep, hasOutput,
                hasOutput ? 'Код выполнен, результат отображается' : 'Результат не найден');

            return hasOutput;
        } catch (error) {
            this.logResult('Сценарий 1', this.currentStep, false, error.message);
            return false;
        }
    }

    async scenario1_Step6_SubmitSolution() {
        this.currentStep = 'Шаг 6: Отправка решения';
        try {
            // Ищем кнопку "Отправить решение"
            const submitBtn = Array.from(document.querySelectorAll('button'))
                .find(btn => btn.textContent.includes('Отправить') || 
                            btn.textContent.includes('Submit'));
            
            if (!submitBtn) {
                this.logResult('Сценарий 1', this.currentStep, false, 'Кнопка отправки не найдена');
                return false;
            }

            submitBtn.click();
            await this.wait(3000); // Ждем анализа

            // Проверяем переход на этап 3
            const stage3 = document.getElementById('stage-3');
            const isActive = stage3 && stage3.classList.contains('active');

            // Проверяем логи
            let hasLogs = false;
            if (window.systemLogger) {
                const logs = window.systemLogger.getLogs({ 
                    category: 'user-action',
                    search: 'submitSolution'
                });
                hasLogs = logs.length > 0;
            }

            this.logResult('Сценарий 1', this.currentStep, isActive || hasLogs,
                isActive ? 'Этап 3 активен, решение отправлено' : 'Этап не переключился',
                { isActive, hasLogs });

            return isActive || hasLogs;
        } catch (error) {
            this.logResult('Сценарий 1', this.currentStep, false, error.message);
            return false;
        }
    }

    // ==========================================
    // СЦЕНАРИЙ 2: Админ-панель
    // ==========================================

    async scenario2_Step1_OpenAdminPanel() {
        this.currentStep = 'Шаг 1: Открытие админ-панели';
        try {
            // Ищем кнопку админ-панели
            const adminBtn = document.querySelector('.admin-link, button[onclick*="Admin"], button[onclick*="admin"]');
            
            if (!adminBtn) {
                // Пробуем найти через текст
                const allButtons = Array.from(document.querySelectorAll('button'));
                const found = allButtons.find(btn => btn.textContent.includes('Админ') || 
                                                    btn.textContent.includes('Admin'));
                if (found) {
                    found.click();
                } else {
                    throw new Error('Кнопка админ-панели не найдена');
                }
            } else {
                adminBtn.click();
            }

            await this.wait(2000);

            // Проверяем наличие админ-панели
            const adminPanel = document.getElementById('admin-panel') || 
                              document.querySelector('.admin-panel, [class*="admin"]');
            const isVisible = adminPanel && (adminPanel.classList.contains('active') || 
                                            adminPanel.style.display !== 'none');

            this.logResult('Сценарий 2', this.currentStep, isVisible,
                isVisible ? 'Админ-панель открыта' : 'Админ-панель не найдена');

            return isVisible;
        } catch (error) {
            this.logResult('Сценарий 2', this.currentStep, false, error.message);
            return false;
        }
    }

    async scenario2_Step2_ViewTaskBank() {
        this.currentStep = 'Шаг 2: Просмотр банка задач';
        try {
            // Ищем таблицу задач
            const taskTable = document.querySelector('table, .task-table, [class*="task"]');
            const hasTable = !!taskTable;

            this.logResult('Сценарий 2', this.currentStep, hasTable,
                hasTable ? 'Таблица задач найдена' : 'Таблица задач не найдена');

            return hasTable;
        } catch (error) {
            this.logResult('Сценарий 2', this.currentStep, false, error.message);
            return false;
        }
    }

    async scenario2_Step3_FilterTasks() {
        this.currentStep = 'Шаг 3: Фильтрация задач';
        try {
            // Ищем фильтры
            const levelFilter = document.querySelector('select[class*="level"], select[id*="level"]');
            const topicFilter = document.querySelector('select[class*="topic"], select[id*="topic"]');
            const searchInput = document.querySelector('input[type="search"], input[placeholder*="поиск"]');

            const hasFilters = !!(levelFilter || topicFilter || searchInput);

            this.logResult('Сценарий 2', this.currentStep, hasFilters,
                hasFilters ? 'Фильтры найдены' : 'Фильтры не найдены',
                { hasLevelFilter: !!levelFilter, hasTopicFilter: !!topicFilter, hasSearch: !!searchInput });

            return hasFilters;
        } catch (error) {
            this.logResult('Сценарий 2', this.currentStep, false, error.message);
            return false;
        }
    }

    // ==========================================
    // СЦЕНАРИЙ 3: Система античита
    // ==========================================

    async scenario3_Step1_CheckAntiCheatStatus() {
        this.currentStep = 'Шаг 1: Проверка статуса античита';
        try {
            // Ищем индикатор античита
            const antiCheatIndicator = document.querySelector('.anti-cheat-status, [class*="anti-cheat"], #anti-cheat-status');
            const hasIndicator = !!antiCheatIndicator;

            this.logResult('Сценарий 3', this.currentStep, hasIndicator,
                hasIndicator ? 'Индикатор античита найден' : 'Индикатор не найден');

            return hasIndicator;
        } catch (error) {
            this.logResult('Сценарий 3', this.currentStep, false, error.message);
            return false;
        }
    }

    async scenario3_Step2_TestCopy() {
        this.currentStep = 'Шаг 2: Тест копирования';
        try {
            // Симулируем событие копирования
            const copyEvent = new ClipboardEvent('copy', { bubbles: true, cancelable: true });
            document.dispatchEvent(copyEvent);
            await this.wait(1000);

            // Проверяем логи античита
            let eventLogged = false;
            if (window.systemLogger) {
                const logs = window.systemLogger.getLogs({ 
                    category: 'anti-cheat',
                    search: 'clipboard-copy'
                });
                eventLogged = logs.length > 0;
            }

            this.logResult('Сценарий 3', this.currentStep, eventLogged,
                eventLogged ? 'Событие копирования залогировано' : 'Событие не залогировано');

            return eventLogged;
        } catch (error) {
            this.logResult('Сценарий 3', this.currentStep, false, error.message);
            return false;
        }
    }

    // ==========================================
    // СЦЕНАРИЙ 4: Просмотр и экспорт логов
    // ==========================================

    async scenario4_Step1_ViewLogs() {
        this.currentStep = 'Шаг 1: Просмотр логов в консоли';
        try {
            const hasLogger = !!window.systemLogger;
            const logsCount = hasLogger ? window.systemLogger.logs.length : 0;

            this.logResult('Сценарий 4', this.currentStep, hasLogger && logsCount > 0,
                hasLogger ? `Логгер доступен, логов: ${logsCount}` : 'Логгер недоступен',
                { logsCount });

            return hasLogger;
        } catch (error) {
            this.logResult('Сценарий 4', this.currentStep, false, error.message);
            return false;
        }
    }

    async scenario4_Step2_GetStats() {
        this.currentStep = 'Шаг 2: Получение статистики';
        try {
            if (!window.systemLogger) {
                throw new Error('Логгер недоступен');
            }

            const stats = window.systemLogger.getStats();
            const hasStats = stats && typeof stats.totalLogs === 'number';

            this.logResult('Сценарий 4', this.currentStep, hasStats,
                hasStats ? 'Статистика получена' : 'Статистика недоступна',
                stats);

            return hasStats;
        } catch (error) {
            this.logResult('Сценарий 4', this.currentStep, false, error.message);
            return false;
        }
    }

    async scenario4_Step3_FilterLogs() {
        this.currentStep = 'Шаг 3: Фильтрация логов';
        try {
            if (!window.systemLogger) {
                throw new Error('Логгер недоступен');
            }

            const userActionLogs = window.systemLogger.getLogs({ category: 'user-action' });
            const apiLogs = window.systemLogger.getLogs({ category: 'api' });
            const errorLogs = window.systemLogger.getLogs({ level: 'error' });
            const searchLogs = window.systemLogger.getLogs({ search: 'task' });

            const allWork = userActionLogs !== null && apiLogs !== null && 
                          errorLogs !== null && searchLogs !== null;

            this.logResult('Сценарий 4', this.currentStep, allWork,
                allWork ? 'Фильтрация работает' : 'Фильтрация не работает',
                { userActionLogs: userActionLogs.length, apiLogs: apiLogs.length, 
                  errorLogs: errorLogs.length, searchLogs: searchLogs.length });

            return allWork;
        } catch (error) {
            this.logResult('Сценарий 4', this.currentStep, false, error.message);
            return false;
        }
    }

    async scenario4_Step4_ExportJSON() {
        this.currentStep = 'Шаг 4: Экспорт логов в JSON';
        try {
            if (!window.systemLogger) {
                throw new Error('Логгер недоступен');
            }

            const exported = window.systemLogger.exportLogs('json');
            const isValidJSON = exported && typeof exported === 'string' && 
                               exported.startsWith('{') && exported.includes('logs');

            this.logResult('Сценарий 4', this.currentStep, isValidJSON,
                isValidJSON ? 'Экспорт JSON работает' : 'Экспорт JSON не работает',
                { exportedLength: exported ? exported.length : 0 });

            return isValidJSON;
        } catch (error) {
            this.logResult('Сценарий 4', this.currentStep, false, error.message);
            return false;
        }
    }

    async scenario4_Step5_ExportText() {
        this.currentStep = 'Шаг 5: Экспорт логов в текстовый формат';
        try {
            if (!window.systemLogger) {
                throw new Error('Логгер недоступен');
            }

            const exported = window.systemLogger.exportLogs('text');
            const isValidText = exported && typeof exported === 'string' && exported.length > 0;

            this.logResult('Сценарий 4', this.currentStep, isValidText,
                isValidText ? 'Экспорт текста работает' : 'Экспорт текста не работает',
                { exportedLength: exported ? exported.length : 0 });

            return isValidText;
        } catch (error) {
            this.logResult('Сценарий 4', this.currentStep, false, error.message);
            return false;
        }
    }

    async scenario4_Step6_ClearLogs() {
        this.currentStep = 'Шаг 6: Очистка логов';
        try {
            if (!window.systemLogger) {
                throw new Error('Логгер недоступен');
            }

            const logsBefore = window.systemLogger.logs.length;
            window.systemLogger.clearLogs();
            await this.wait(500);
            const logsAfter = window.systemLogger.logs.length;

            const cleared = logsAfter === 0 || logsAfter < logsBefore;

            this.logResult('Сценарий 4', this.currentStep, cleared,
                cleared ? 'Логи очищены' : 'Логи не очищены',
                { logsBefore, logsAfter });

            return cleared;
        } catch (error) {
            this.logResult('Сценарий 4', this.currentStep, false, error.message);
            return false;
        }
    }

    // ==========================================
    // Запуск всех тестов
    // ==========================================

    async runScenario1() {
        console.log('%c=== СЦЕНАРИЙ 1: Полный цикл интервью ===', 'font-size: 16px; font-weight: bold; color: blue');
        this.currentScenario = 'Сценарий 1';

        const steps = [
            () => this.scenario1_Step1_SelectLevel(),
            () => this.scenario1_Step2_GenerateTask(),
            () => this.scenario1_Step3_WriteSolution(),
            () => this.scenario1_Step4_RunTests(),
            () => this.scenario1_Step5_ManualExecution(),
            () => this.scenario1_Step6_SubmitSolution()
        ];

        for (const step of steps) {
            try {
                await step();
                await this.wait(this.waitTime);
            } catch (error) {
                this.logResult(this.currentScenario, 'Ошибка выполнения', false, error.message);
            }
        }
    }

    async runScenario2() {
        console.log('%c=== СЦЕНАРИЙ 2: Админ-панель ===', 'font-size: 16px; font-weight: bold; color: blue');
        this.currentScenario = 'Сценарий 2';

        const steps = [
            () => this.scenario2_Step1_OpenAdminPanel(),
            () => this.scenario2_Step2_ViewTaskBank(),
            () => this.scenario2_Step3_FilterTasks()
        ];

        for (const step of steps) {
            try {
                await step();
                await this.wait(this.waitTime);
            } catch (error) {
                this.logResult(this.currentScenario, 'Ошибка выполнения', false, error.message);
            }
        }
    }

    async runScenario3() {
        console.log('%c=== СЦЕНАРИЙ 3: Система античита ===', 'font-size: 16px; font-weight: bold; color: blue');
        this.currentScenario = 'Сценарий 3';

        const steps = [
            () => this.scenario3_Step1_CheckAntiCheatStatus(),
            () => this.scenario3_Step2_TestCopy()
        ];

        for (const step of steps) {
            try {
                await step();
                await this.wait(this.waitTime);
            } catch (error) {
                this.logResult(this.currentScenario, 'Ошибка выполнения', false, error.message);
            }
        }
    }

    async runScenario4() {
        console.log('%c=== СЦЕНАРИЙ 4: Просмотр и экспорт логов ===', 'font-size: 16px; font-weight: bold; color: blue');
        this.currentScenario = 'Сценарий 4';

        const steps = [
            () => this.scenario4_Step1_ViewLogs(),
            () => this.scenario4_Step2_GetStats(),
            () => this.scenario4_Step3_FilterLogs(),
            () => this.scenario4_Step4_ExportJSON(),
            () => this.scenario4_Step5_ExportText(),
            () => this.scenario4_Step6_ClearLogs()
        ];

        for (const step of steps) {
            try {
                await step();
                await this.wait(this.waitTime);
            } catch (error) {
                this.logResult(this.currentScenario, 'Ошибка выполнения', false, error.message);
            }
        }
    }

    async runSetup() {
        console.log('%c=== ПОДГОТОВКА К ТЕСТИРОВАНИЮ ===', 'font-size: 16px; font-weight: bold; color: green');
        
        await this.checkLogger();
        await this.wait(1000);
        await this.checkBackend();
        await this.wait(1000);
    }

    async runAllTests() {
        console.log('%c🚀 ЗАПУСК ПОЛНОГО ТЕСТИРОВАНИЯ ПО TEST_SCENARIO.md', 
                   'font-size: 18px; font-weight: bold; color: purple; padding: 10px;');
        
        this.results = [];
        
        // Подготовка
        await this.runSetup();
        await this.wait(2000);

        // Запуск сценариев
        await this.runScenario4(); // Начинаем с логов, так как они нужны для других тестов
        await this.wait(2000);
        
        await this.runScenario3();
        await this.wait(2000);
        
        await this.runScenario2();
        await this.wait(2000);
        
        await this.runScenario1(); // Последний, так как он самый длинный
        await this.wait(2000);

        // Вывод итогового отчета
        this.printSummary();
    }

    printSummary() {
        console.log('%c=== ИТОГОВЫЙ ОТЧЕТ ===', 'font-size: 16px; font-weight: bold; color: purple');
        
        const total = this.results.length;
        const passed = this.results.filter(r => r.passed).length;
        const failed = total - passed;
        const passRate = total > 0 ? ((passed / total) * 100).toFixed(1) : 0;

        console.log(`Всего тестов: ${total}`);
        console.log(`✅ Пройдено: ${passed}`);
        console.log(`❌ Провалено: ${failed}`);
        console.log(`📊 Процент успеха: ${passRate}%`);

        // Группировка по сценариям
        const byScenario = {};
        this.results.forEach(r => {
            if (!byScenario[r.scenario]) {
                byScenario[r.scenario] = { total: 0, passed: 0 };
            }
            byScenario[r.scenario].total++;
            if (r.passed) byScenario[r.scenario].passed++;
        });

        console.log('\n%cПо сценариям:', 'font-weight: bold');
        Object.keys(byScenario).forEach(scenario => {
            const { total, passed } = byScenario[scenario];
            const rate = ((passed / total) * 100).toFixed(1);
            console.log(`  ${scenario}: ${passed}/${total} (${rate}%)`);
        });

        // Проваленные тесты
        const failedTests = this.results.filter(r => !r.passed);
        if (failedTests.length > 0) {
            console.log('\n%c❌ Проваленные тесты:', 'font-weight: bold; color: red');
            failedTests.forEach(test => {
                console.log(`  - ${test.scenario}: ${test.step} - ${test.message}`);
            });
        }

        // Экспорт результатов
        const summary = {
            timestamp: new Date().toISOString(),
            total,
            passed,
            failed,
            passRate: parseFloat(passRate),
            byScenario,
            results: this.results
        };

        // Сохраняем в window для доступа
        window.testResults = summary;
        
        console.log('\n%c💾 Результаты сохранены в window.testResults', 'color: blue');
        console.log('%c📥 Для экспорта выполните: JSON.stringify(window.testResults, null, 2)', 'color: blue');
    }

    // Экспорт результатов в файл
    exportResults() {
        if (!window.testResults) {
            console.error('Результаты тестирования не найдены. Запустите runAllTests() сначала.');
            return;
        }

        const json = JSON.stringify(window.testResults, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `test-results-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        
        console.log('✅ Результаты экспортированы');
    }
}

// Создаем глобальный экземпляр
const testRunner = new TestScenarioRunner();

// Экспортируем функции
export async function runAllTests() {
    return await testRunner.runAllTests();
}

export async function runScenario1() {
    return await testRunner.runScenario1();
}

export async function runScenario2() {
    return await testRunner.runScenario2();
}

export async function runScenario3() {
    return await testRunner.runScenario3();
}

export async function runScenario4() {
    return await testRunner.runScenario4();
}

export function exportResults() {
    return testRunner.exportResults();
}

export function printSummary() {
    return testRunner.printSummary();
}

// Делаем доступным глобально для удобства
if (typeof window !== 'undefined') {
    window.testRunner = testRunner;
    window.runAllTests = runAllTests;
    window.runScenario1 = runScenario1;
    window.runScenario2 = runScenario2;
    window.runScenario3 = runScenario3;
    window.runScenario4 = runScenario4;
    window.exportTestResults = exportResults;
}

console.log('%c✅ Test Scenario Runner загружен!', 'color: green; font-weight: bold');
console.log('Использование:');
console.log('  - runAllTests() - запустить все тесты');
console.log('  - runScenario1() - Сценарий 1: Полный цикл интервью');
console.log('  - runScenario2() - Сценарий 2: Админ-панель');
console.log('  - runScenario3() - Сценарий 3: Система античита');
console.log('  - runScenario4() - Сценарий 4: Логи');
console.log('  - exportTestResults() - экспортировать результаты');

