// Демонстрация возможностей детектирования читерства

class AntiCheatDemo {
    static showDemo() {
        const messages = [
            {
                type: 'clipboard',
                message: '🔍 Обнаружено копирование кода из буфера обмена',
                severity: 'medium'
            },
            {
                type: 'devtools',
                message: '⚠️ Обнаружено открытие DevTools',
                severity: 'medium'
            },
            {
                type: 'tab_switch',
                message: '📑 Обнаружено переключение вкладок',
                severity: 'low'
            },
            {
                type: 'idle',
                message: '⏸️ Обнаружен период бездействия',
                severity: 'low'
            },
            {
                type: 'rapid_paste',
                message: '⚡ Обнаружены множественные вставки кода',
                severity: 'high'
            }
        ];

        return messages;
    }

    static displayInChat(chatService) {
        const messages = this.showDemo();
        
        messages.forEach((msg, index) => {
            setTimeout(() => {
                chatService.addMessage('system', `[Система защиты] ${msg.message}`, 'warning');
            }, index * 1000);
        });
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = AntiCheatDemo;
}

