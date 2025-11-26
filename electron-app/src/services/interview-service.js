// Для Electron используем window.require, для браузера - fetch напрямую
let ipcRenderer;
try {
    if (typeof window !== 'undefined' && window.require) {
        ipcRenderer = window.require('electron').ipcRenderer;
    }
} catch (e) {
    // Не в Electron окружении
}

const API_BASE = 'http://localhost:3000/api';

class InterviewService {
    static async generateTask(params) {
        const response = await fetch(`${API_BASE}/tasks/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params)
        });
        return await response.json();
    }

    static async generateTaskStream(params, onChunk) {
        const response = await fetch(`${API_BASE}/tasks/generate-stream`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params)
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = JSON.parse(line.slice(6));
                    if (data.chunk) {
                        onChunk(data.chunk, data.accumulated);
                    }
                    if (data.done) {
                        return data.task;
                    }
                }
            }
        }
    }

    static async runTests(params) {
        const response = await fetch(`${API_BASE}/tests/run`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params)
        });
        return await response.json();
    }

    static async analyzeSolution(params) {
        const response = await fetch(`${API_BASE}/solutions/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params)
        });
        return await response.json();
    }

    static async generateQuestion(params) {
        const response = await fetch(`${API_BASE}/chat/question`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params)
        });
        return await response.json();
    }

    static async evaluateAnswer(params) {
        const response = await fetch(`${API_BASE}/chat/evaluate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params)
        });
        return await response.json();
    }

    static async generateFinalQuestion(params) {
        const response = await fetch(`${API_BASE}/chat/final-question`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params)
        });
        const data = await response.json();
        return data.question;
    }

    static async generateDialogueResponse(params) {
        const response = await fetch(`${API_BASE}/chat/dialogue`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params)
        });
        const data = await response.json();
        return data.response;
    }

    static async generateReport(params) {
        const response = await fetch(`${API_BASE}/reports/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params)
        });
        return await response.json();
    }

    static async analyzeError(params) {
        const response = await fetch(`${API_BASE}/solutions/analyze-error`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params)
        });
        return await response.json();
    }
}

// Экспорт для использования в других файлах
if (typeof module !== 'undefined' && module.exports) {
    module.exports = InterviewService;
}

