// Интеграция системы античита с IDE
class AntiCheatIntegration {
    constructor() {
        this.securityEvents = [];
        this.screenshotCount = 0;
        this.lastScreenshotTime = 0;
        this.isMonitoring = false;
        this.cheatDetection = {
            clipboardUsage: 0,
            tabSwitches: 0,
            devToolsOpened: false,
            rapidActions: 0,
            suspiciousPatterns: 0
        };

        console.log('🛡️ AntiCheatSystem: Конструктор вызван');
        this.init();
    }

    init() {
        console.log('🛡️ AntiCheatSystem: Инициализация начата');
        this.setupEventListeners();
        this.startMonitoring();
        this.showWelcomeMessage();
    }

    setupEventListeners() {
        console.log('🛡️ AntiCheatSystem: Настройка слушателей событий');

        // Детектирование переключения вкладок
        document.addEventListener('visibilitychange', () => {
            console.log('🛡️ visibilitychange event:', document.hidden);
            if (document.hidden) {
                this.detectTabSwitch();
            }
        });

        // Детектирование потери фокуса
        window.addEventListener('blur', () => {
            console.log('🛡️ blur event');
            this.detectFocusLoss();
        });

        // Детектирование контекстного меню
        document.addEventListener('contextmenu', (e) => {
            console.log('🛡️ contextmenu event');
            e.preventDefault();
            this.detectContextMenu();
        });

        // Детектирование копирования
        document.addEventListener('copy', (e) => {
            console.log('🛡️ copy event');
            this.detectCopyAction();
        });

        // Детектирование вставки
        document.addEventListener('paste', (e) => {
            console.log('🛡️ paste event');
            this.detectPasteAction(e);
        });

        // Детектирование нажатий клавиш
        document.addEventListener('keydown', (e) => {
            this.detectSuspiciousShortcuts(e);
        });

        // Мониторинг DevTools
        this.setupDevToolsDetection();

        console.log('🛡️ AntiCheatSystem: Все слушатели установлены');
    }

    setupDevToolsDetection() {
        console.log('🛡️ AntiCheatSystem: Настройка детектирования DevTools');
        let devToolsCheck = setInterval(() => {
            const widthThreshold = window.outerWidth - window.innerWidth > 160;
            const heightThreshold = window.outerHeight - window.innerHeight > 160;

            if ((widthThreshold || heightThreshold) && !this.cheatDetection.devToolsOpened) {
                console.log('🛡️ DevTools обнаружены!');
                this.cheatDetection.devToolsOpened = true;
                this.detectDevTools();
            }
        }, 1000);
    }

    startMonitoring() {
        this.isMonitoring = true;
        this.startTime = Date.now();

        console.log('🛡️ AntiCheatSystem: Мониторинг запущен');

        // Случайные скриншоты каждые 30-60 секунд
        setInterval(() => {
            if (this.isMonitoring && Math.random() > 0.7) {
                console.log('🛡️ Случайный скриншот');
                this.takeScreenshot();
            }
        }, 30000);

        // Мониторинг бездействия
        this.setupIdleDetection();

        // Тестовое уведомление для проверки
        setTimeout(() => {
            this.logSecurityEvent(
                'system_start',
                '🛡️ Система защиты активирована и работает',
                'low'
            );
        }, 2000);
    }

    setupIdleDetection() {
        console.log('🛡️ AntiCheatSystem: Настройка детектирования бездействия');
        let idleTimer;
        const resetIdleTimer = () => {
            clearTimeout(idleTimer);
            idleTimer = setTimeout(() => {
                console.log('🛡️ Обнаружено бездействие');
                this.detectIdleTime();
            }, 45000); // 45 секунд
        };

        document.addEventListener('mousemove', resetIdleTimer);
        document.addEventListener('keypress', resetIdleTimer);
        document.addEventListener('click', resetIdleTimer);
        resetIdleTimer();
    }

    // === ДЕТЕКТОРЫ ПОДОЗРИТЕЛЬНЫХ ДЕЙСТВИЙ ===

    detectTabSwitch() {
        console.log('🛡️ detectTabSwitch вызван');
        this.cheatDetection.tabSwitches++;
        this.logSecurityEvent(
            'tab_switch',
            '📑 Обнаружено переключение вкладок',
            'medium'
        );
        this.takeScreenshot();
    }

    detectFocusLoss() {
        console.log('🛡️ detectFocusLoss вызван');
        this.logSecurityEvent(
            'focus_lost',
            '🎯 Обнаружена потеря фокуса окна',
            'medium'
        );
    }

    detectContextMenu() {
        console.log('🛡️ detectContextMenu вызван');
        this.logSecurityEvent(
            'context_menu',
            '🖱️ Блокировка контекстного меню',
            'low'
        );
    }

    detectCopyAction() {
        console.log('🛡️ detectCopyAction вызван');
        this.cheatDetection.clipboardUsage++;
        this.logSecurityEvent(
            'clipboard',
            '🔍 Обнаружено копирование кода',
            'medium'
        );
    }

    detectPasteAction(event) {
        console.log('🛡️ detectPasteAction вызван');
        const currentTime = Date.now();

        // Проверка быстрых вставок
        if (currentTime - this.lastPasteTime < 2000) {
            this.cheatDetection.rapidActions++;
            this.logSecurityEvent(
                'rapid_paste',
                '⚡ Обнаружены множественные вставки кода',
                'high'
            );
            this.takeScreenshot();
        }

        this.lastPasteTime = currentTime;

        // Анализ вставленного контента
        try {
            const pastedText = event.clipboardData?.getData('text') || '';
            this.analyzePastedContent(pastedText);
        } catch (error) {
            console.log('🛡️ Ошибка при анализе вставки:', error);
        }
    }

    detectLargePasteByLines(pastedText) {
        // Проверяем вставку больше 20 строк
        const lines = pastedText.split('\n');
        const nonEmptyLines = lines.filter(line => line.trim().length > 0);

        if (nonEmptyLines.length > 20) {
            this.logSecurityEvent(
                'large_line_paste',
                '📄 Обнаружена вставка большого количества строк кода',
                'high',
                `Вставлено ${nonEmptyLines.length} строк`
            );
            this.takeScreenshot();
            return true;
        }
        return false;
    }



   analyzePastedContent(text) {
    // Проверка на количество строк (более 20)
    this.detectLargePasteByLines(text);
    
    if (text.length > 150) {
        this.logSecurityEvent(
            'large_paste', 
            '📋 Обнаружена вставка большого объема кода', 
            'medium',
            `Длина вставки: ${text.length} символов`
        );
        this.takeScreenshot();
    }

    // Проверка на подозрительные паттерны
    const plagiarismPatterns = [
        { pattern: /class.*extends/, message: 'Наследование классов' },
        { pattern: /import.*from/, message: 'Импорты модулей' },
        { pattern: /require\(/, message: 'CommonJS require' },
        { pattern: /\/\/\s*https?:\/\//, message: 'Ссылки в комментариях' },
        { pattern: /\/\/\s*Источник:/, message: 'Пометка об источнике' },
        { pattern: /\/\/\s*Copied from/, message: 'Пометка о копировании' }
    ];

    plagiarismPatterns.forEach(({ pattern, message }) => {
        if (pattern.test(text)) {
            this.cheatDetection.suspiciousPatterns++;
            this.logSecurityEvent(
                'plagiarism_marker', 
                `🚫 Обнаружен подозрительный паттерн: ${message}`, 
                'high'
            );
            this.takeScreenshot();
        }
    });
}

    detectSuspiciousShortcuts(event) {
        const suspiciousCombinations = [
            { ctrl: true, key: 'u', message: 'Просмотр исходного кода' },
            { ctrl: true, shift: true, key: 'i', message: 'Открытие DevTools' },
            {ctrl: true, key: 'v', message: 'Попытка вставки'},
            { f12: true, message: 'Открытие DevTools' },
            { ctrl: true, shift: true, key: 'c', message: 'Дублирование копирования' },
            { ctrl: true, key: 's', message: 'Попытка сохранения' }
        ];

        suspiciousCombinations.forEach(({ ctrl, shift, f12, key, message }) => {
            const match = (
                (ctrl === undefined || ctrl === event.ctrlKey) &&
                (shift === undefined || shift === event.shiftKey) &&
                ((key && event.key.toLowerCase() === key) || (f12 && event.key === 'F12'))
            );

            if (match) {
                console.log('🛡️ Подозрительная комбинация клавиш:', event.key, event.ctrlKey, event.shiftKey);
                event.preventDefault();
                this.logSecurityEvent(
                    'suspicious_shortcut',
                    `⌨️ Блокировка подозрительной комбинации: ${message}`,
                    'high'
                );
                this.takeScreenshot();
            }
        });
    }

    detectDevTools() {
        console.log('🛡️ detectDevTools вызван');
        this.logSecurityEvent(
            'devtools',
            '⚠️ Обнаружено открытие DevTools',
            'high'
        );
        this.takeScreenshot();
    }

    detectIdleTime() {
        console.log('🛡️ detectIdleTime вызван');
        this.logSecurityEvent(
            'idle',
            '⏸️ Обнаружен период бездействия',
            'low'
        );
    }

    detectRapidCoding() {
        console.log('🛡️ detectRapidCoding вызван');
        this.cheatDetection.rapidActions++;
        this.logSecurityEvent(
            'rapid_input',
            '💨 Обнаружен слишком быстрый ввод кода',
            'medium'
        );
        this.takeScreenshot();
    }

    // === СИСТЕМА СКРИНШОТОВ ===

    takeScreenshot() {
        if (!this.isMonitoring) return;

        this.screenshotCount++;
        const timestamp = new Date().toLocaleTimeString();

        console.log(`🛡️ takeScreenshot #${this.screenshotCount} в ${timestamp}`);

        const screenshotData = {
            id: this.screenshotCount,
            timestamp: timestamp,
            code: window.editor ? window.editor.getValue() : 'N/A',
            securityEvents: [...this.securityEvents],
            cheatMetrics: { ...this.cheatDetection }
        };

        // Показываем уведомление о скриншоте
        this.showScreenshotNotification();

        // Сохраняем в localStorage для демо
        this.saveScreenshot(screenshotData);

        this.lastScreenshotTime = Date.now();

        return screenshotData;
    }

    saveScreenshot(screenshotData) {
        const screenshots = JSON.parse(localStorage.getItem('interview_screenshots') || '[]');
        screenshots.push(screenshotData);
        localStorage.setItem('interview_screenshots', JSON.stringify(screenshots));
    }

    // === СИСТЕМА УВЕДОМЛЕНИЙ ===

    logSecurityEvent(type, message, severity = 'medium') {
        console.log(`🛡️ logSecurityEvent: ${type} - ${message} - ${severity}`);

        const event = {
            type,
            message,
            severity,
            timestamp: new Date().toLocaleTimeString(),
            riskScore: this.calculateRiskScore(severity)
        };

        this.securityEvents.push(event);
        this.showSecurityAlert(event);

        return event;
    }

    calculateRiskScore(severity) {
        const scores = { low: 1, medium: 3, high: 5 };
        return scores[severity] || 1;
    }

    showSecurityAlert(event) {
        console.log(`🛡️ showSecurityAlert: Создание уведомления для "${event.message}"`);

        // Проверяем, есть ли стили в DOM
        this.ensureStylesExist();

        const alert = document.createElement('div');
        alert.className = `security-alert severity-${event.severity}`;
        alert.innerHTML = `
            <div class="security-alert-icon">${this.getSeverityIcon(event.severity)}</div>
            <div class="security-alert-content">
                <div class="security-alert-title">${event.message}</div>
                <div class="security-alert-time">${event.timestamp}</div>
            </div>
            <button class="security-alert-close" onclick="this.parentElement.remove()">×</button>
        `;

        // Добавляем в документ
        document.body.appendChild(alert);
        console.log('🛡️ Уведомление добавлено в DOM');

        // Автоматическое удаление через 5 секунд
        setTimeout(() => {
            if (alert.parentElement) {
                console.log('🛡️ Автоматическое удаление уведомления');
                alert.remove();
            }
        }, 5000);
    }

    showScreenshotNotification() {
        console.log('🛡️ showScreenshotNotification: Создание уведомления о скриншоте');

        // Проверяем, есть ли стили в DOM
        this.ensureStylesExist();

        const notification = document.createElement('div');
        notification.className = 'screenshot-notification';
        notification.innerHTML = `
            <div class="screenshot-icon">📸</div>
            <div class="screenshot-content">
                <div class="screenshot-title">Скриншот сохранен</div>
                <div class="screenshot-desc">Система зафиксировала текущее состояние</div>
            </div>
        `;

        document.body.appendChild(notification);
        console.log('🛡️ Уведомление о скриншоте добавлено в DOM');

        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 3000);
    }

    ensureStylesExist() {
        // Проверяем, есть ли уже стили в DOM
        const existingStyles = document.querySelector('style[data-anti-cheat-styles]');
        if (existingStyles) return;

        // Проверяем, подключен ли styles.css с нашими стилями
        const stylesheets = Array.from(document.styleSheets);
        let hasAntiCheatStyles = false;

        for (let stylesheet of stylesheets) {
            try {
                const rules = Array.from(stylesheet.cssRules || []);
                const hasSecurityAlert = rules.some(rule =>
                    rule.selectorText && rule.selectorText.includes('.security-alert')
                );
                if (hasSecurityAlert) {
                    hasAntiCheatStyles = true;
                    break;
                }
            } catch (e) {
                // Игнорируем ошибки CORS
            }
        }

        // Если стилей нет ни в styles.css, ни в DOM - добавляем динамически
        if (!hasAntiCheatStyles) {
            console.log('🛡️ Стили не найдены, добавляем динамически');
            this.addDynamicStyles();
        }
    }

    addDynamicStyles() {
        const styles = `
            .security-alert {
                position: fixed;
                top: 20px;
                right: 20px;
                background: #2d2d30;
                border-left: 4px solid #4ec9b0;
                padding: 15px;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                z-index: 10000;
                max-width: 400px;
                animation: slideInRight 0.3s ease;
                display: flex;
                align-items: flex-start;
                gap: 12px;
            }
            .security-alert.severity-high {
                border-left-color: #f14c4c;
                background: #5a1a1a;
            }
            .security-alert.severity-medium {
                border-left-color: #e9b949;
                background: #5a4a1a;
            }
            .security-alert.severity-low {
                border-left-color: #4ec9b0;
                background: #1a5a3a;
            }
            .security-alert-icon {
                font-size: 20px;
                flex-shrink: 0;
            }
            .security-alert-content {
                flex: 1;
                min-width: 0;
            }
            .security-alert-title {
                font-weight: bold;
                margin-bottom: 5px;
                color: white;
                font-size: 14px;
                line-height: 1.3;
            }
            .security-alert-time {
                font-size: 11px;
                color: #858585;
            }
            .security-alert-close {
                background: none;
                border: none;
                color: #858585;
                font-size: 18px;
                cursor: pointer;
                padding: 0;
                width: 20px;
                height: 20px;
                flex-shrink: 0;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .security-alert-close:hover {
                color: white;
            }
            .screenshot-notification {
                position: fixed;
                top: 20px;
                right: 450px;
                background: #1e1e1e;
                border: 1px solid #4ec9b0;
                padding: 12px;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                z-index: 9999;
                animation: slideInRight 0.3s ease;
                display: flex;
                align-items: center;
                gap: 10px;
                max-width: 300px;
            }
            .screenshot-icon {
                font-size: 18px;
                flex-shrink: 0;
            }
            .screenshot-content {
                flex: 1;
            }
            .screenshot-title {
                font-weight: bold;
                color: #4ec9b0;
                margin-bottom: 2px;
                font-size: 14px;
            }
            .screenshot-desc {
                font-size: 12px;
                color: #858585;
            }
            @keyframes slideInRight {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
        `;

        const styleSheet = document.createElement('style');
        styleSheet.setAttribute('data-anti-cheat-styles', 'true');
        styleSheet.textContent = styles;
        document.head.appendChild(styleSheet);
    }

    showWelcomeMessage() {
        console.log('🛡️ showWelcomeMessage: Показ приветственного сообщения');
    }

    getSeverityIcon(severity) {
        const icons = {
            low: 'ℹ️',
            medium: '⚠️',
            high: '🚨'
        };
        return icons[severity] || 'ℹ️';
    }

    // === ПУБЛИЧНЫЕ МЕТОДЫ ===

    getSecurityData() {
        return {
            events: this.securityEvents,
            screenshots: this.screenshotCount,
            metrics: this.cheatDetection,
            monitoringDuration: Math.floor((Date.now() - this.startTime) / 1000)
        };
    }

    stopMonitoring() {
        this.isMonitoring = false;
        this.logSecurityEvent(
            'system_stop',
            '🛡️ Система защиты остановлена',
            'low'
        );
    }

}



// Интеграция с редактором кода
function setupEditorMonitoring() {
    if (!window.editor) {
        console.log('🛡️ setupEditorMonitoring: редактор не найден, повтор через 1 сек');
        setTimeout(setupEditorMonitoring, 1000);
        return;
    }

    console.log('🛡️ setupEditorMonitoring: редактор найден, настройка мониторинга');

    let lastContent = window.editor.getValue();
    let lastChangeTime = Date.now();
    let changeCount = 0;

    window.editor.onDidChangeModelContent(() => {
        const currentTime = Date.now();
        const currentContent = window.editor.getValue();

        // Детектирование быстрого набора
        if (currentTime - lastChangeTime < 100) {
            changeCount++;
            if (changeCount > 10) {
                console.log('🛡️ Обнаружен быстрый ввод кода');
                if (window.antiCheatSystem) {
                    window.antiCheatSystem.detectRapidCoding();
                }
                changeCount = 0;
            }
        } else {
            changeCount = 0;
        }

        lastChangeTime = currentTime;

        // Детектирование больших изменений (возможная вставка)
        if (currentContent.length - lastContent.length > 50) {
            console.log('🛡️ Обнаружена большая вставка кода');
            if (window.antiCheatSystem) {
                window.antiCheatSystem.logSecurityEvent(
                    'large_insert',
                    '📝 Обнаружена вставка большого фрагмента кода',
                    'medium'
                );
            }
        }

        lastContent = currentContent;
    });

    console.log('🛡️ Мониторинг редактора настроен');
}

// Инициализация при загрузке
function integrateAntiCheat() {
    console.log('🛡️ integrateAntiCheat: Начало интеграции');
    window.antiCheatSystem = new AntiCheatIntegration();
    setTimeout(setupEditorMonitoring, 2000);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', integrateAntiCheat);
} else {
    integrateAntiCheat();
}