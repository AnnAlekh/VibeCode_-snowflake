// Report management module
import { interviewState, addCandidateHistoryEntry } from './state.js';
import { escapeHtml, updateStage, updateProgress, showNotification, showError, refreshCandidateInsights } from './ui-utils.js';
import { withLLM } from './metrics-manager.js';
import { API_BASE, fetchWithTimeout } from './api.js';
import { addChatMessage, hideTypingIndicator } from './chat-manager.js';

export async function showFinalReport() {
    try {
        updateStage(6, 'active');
        updateProgress(90);
        showNotification('Генерация финального отчета...', 'info');
        
        const { result: report, duration: generationTime } = await withLLM(async () => {
            const response = await fetch(`${API_BASE}/reports/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    taskHistory: interviewState.taskHistory,
                    chatHistory: interviewState.chatHistory,
                    metrics: interviewState.metrics
                })
            });

            if (!response.ok) {
                throw new Error('Failed to generate report');
            }

            return await response.json();
        });

        updateStage(6, 'completed', generationTime);
        updateProgress(100);
        showNotification('Отчет готов!', 'success');
        
        document.getElementById('interview-screen').classList.remove('active');
        document.getElementById('report-screen').classList.add('active');

        displayReport(report);
        addCandidateHistoryEntry({
            score: report?.scores?.overall,
            technical: report?.scores?.technical,
            communication: report?.scores?.communication,
            tasks: report?.summary?.totalTasks,
            generatedAt: new Date().toISOString()
        });
        refreshCandidateInsights();
    } catch (error) {
        console.error('Error generating report:', error);
        showNotification('Ошибка при генерации отчета', 'error');
        showError('Ошибка при генерации отчета');
    }
}

export function displayReport(report) {
    const container = document.getElementById('report-content');
    if (!container) return;
    
    container.innerHTML = `
        <h1 style="color: #4ec9b0; margin-bottom: 30px; font-size: 32px;">Финальный отчет</h1>
        
        <div class="report-section">
            <h2>Общая статистика</h2>
            <p><strong>Выполнено задач:</strong> ${report.summary.totalTasks}</p>
            <p><strong>Общая оценка:</strong> ${report.scores.overall}/100</p>
            <p><strong>Техническая оценка:</strong> ${report.scores.technical}/100</p>
            <p><strong>Коммуникативная оценка:</strong> ${report.scores.communication}/100</p>
            <p><strong>Время решения:</strong> ${Math.floor((interviewState.metrics.timeSpent || 0) / 1000 / 60)} минут</p>
        </div>

        <div class="report-section">
            <h2>Сильные стороны</h2>
            <ul class="strengths-list">
                ${(report.strengths || []).map(s => `<li>${escapeHtml(s)}</li>`).join('')}
            </ul>
        </div>

        <div class="report-section">
            <h2>Области для улучшения</h2>
            <ul class="weaknesses-list">
                ${(report.weaknesses || []).map(w => `<li>${escapeHtml(w)}</li>`).join('')}
            </ul>
        </div>

        <div class="report-section">
            <h2>Детальный анализ</h2>
            <p style="line-height: 1.8; white-space: pre-wrap;">${escapeHtml(report.detailedAnalysis || 'Анализ недоступен')}</p>
        </div>

        ${report.recommendations && report.recommendations.length > 0 ? `
        <div class="report-section">
            <h2>Рекомендации</h2>
            <ul style="margin-left: 20px;">
                ${report.recommendations.map(r => `<li style="margin: 10px 0; line-height: 1.6;">${escapeHtml(r)}</li>`).join('')}
            </ul>
        </div>
        ` : ''}

        <div style="margin-top: 40px; text-align: center; display: flex; gap: 15px; justify-content: center; flex-wrap: wrap;">
            <button class="btn btn-submit" onclick="window.downloadReport('json')" style="padding: 15px 30px; font-size: 16px;">
                Скачать JSON
            </button>
            <button class="btn btn-submit" onclick="window.downloadReport('html')" style="padding: 15px 30px; font-size: 16px;">
                Скачать HTML
            </button>
        </div>
    `;
}

export function downloadReport(format = 'json') {
    const report = {
        taskHistory: interviewState.taskHistory,
        chatHistory: interviewState.chatHistory,
        metrics: interviewState.metrics,
        generatedAt: new Date().toISOString()
    };

    if (format === 'html') {
        // Получаем данные отчета из DOM или используем последний сгенерированный отчет
        const reportContent = document.getElementById('report-content');
        if (reportContent) {
            const htmlContent = `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Отчет о собеседовании</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: #1e1e1e;
            color: #d4d4d4;
            padding: 40px 20px;
            line-height: 1.6;
        }
        .container {
            max-width: 900px;
            margin: 0 auto;
            background: #252526;
            padding: 40px;
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        }
        h1 {
            color: #4ec9b0;
            margin-bottom: 30px;
            font-size: 32px;
            border-bottom: 2px solid #4ec9b0;
            padding-bottom: 15px;
        }
        h2 {
            color: #4ec9b0;
            margin-top: 30px;
            margin-bottom: 15px;
            font-size: 24px;
        }
        .report-section {
            margin-bottom: 30px;
            padding: 20px;
            background: #2d2d30;
            border-radius: 6px;
            border-left: 4px solid #4ec9b0;
        }
        .report-section p {
            margin: 10px 0;
            color: #d4d4d4;
        }
        .report-section strong {
            color: #4ec9b0;
        }
        ul {
            margin-left: 20px;
            margin-top: 10px;
        }
        li {
            margin: 8px 0;
            line-height: 1.8;
        }
        .strengths-list li {
            color: #4ec9b0;
        }
        .weaknesses-list li {
            color: #ce9178;
        }
        .metadata {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #3e3e42;
            color: #858585;
            font-size: 12px;
            text-align: center;
        }
        @media print {
            body { background: white; color: black; }
            .container { background: white; box-shadow: none; }
            h1, h2 { color: #1e1e1e; }
            .report-section { background: #f5f5f5; border-left-color: #1e1e1e; }
        }
    </style>
</head>
<body>
    <div class="container">
        ${reportContent.innerHTML}
        <div class="metadata">
            <p>Отчет сгенерирован: ${new Date().toLocaleString('ru-RU')}</p>
            <p>Платформа: AI Interviewer System</p>
        </div>
    </div>
</body>
</html>`;
            const blob = new Blob([htmlContent], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `interview-report-${Date.now()}.html`;
            a.click();
            URL.revokeObjectURL(url);
        } else {
            // Fallback: создаем HTML из данных
            const htmlContent = generateHTMLReport(report);
            const blob = new Blob([htmlContent], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `interview-report-${Date.now()}.html`;
            a.click();
            URL.revokeObjectURL(url);
        }
    } else {
        // JSON формат
        const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `interview-report-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }
}

function generateHTMLReport(report) {
    const formatDate = (dateStr) => {
        if (!dateStr) return 'Не указано';
        try {
            return new Date(dateStr).toLocaleString('ru-RU');
        } catch {
            return dateStr;
        }
    };

    return `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Отчет о собеседовании</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: #1e1e1e;
            color: #d4d4d4;
            padding: 40px 20px;
            line-height: 1.6;
        }
        .container {
            max-width: 900px;
            margin: 0 auto;
            background: #252526;
            padding: 40px;
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        }
        h1 {
            color: #4ec9b0;
            margin-bottom: 30px;
            font-size: 32px;
            border-bottom: 2px solid #4ec9b0;
            padding-bottom: 15px;
        }
        h2 {
            color: #4ec9b0;
            margin-top: 30px;
            margin-bottom: 15px;
            font-size: 24px;
        }
        .report-section {
            margin-bottom: 30px;
            padding: 20px;
            background: #2d2d30;
            border-radius: 6px;
            border-left: 4px solid #4ec9b0;
        }
        .report-section p {
            margin: 10px 0;
            color: #d4d4d4;
        }
        .report-section strong {
            color: #4ec9b0;
        }
        ul {
            margin-left: 20px;
            margin-top: 10px;
        }
        li {
            margin: 8px 0;
            line-height: 1.8;
        }
        .metadata {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #3e3e42;
            color: #858585;
            font-size: 12px;
            text-align: center;
        }
        @media print {
            body { background: white; color: black; }
            .container { background: white; box-shadow: none; }
            h1, h2 { color: #1e1e1e; }
            .report-section { background: #f5f5f5; border-left-color: #1e1e1e; }
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Финальный отчет</h1>
        
        <div class="report-section">
            <h2>Общая статистика</h2>
            <p><strong>Выполнено задач:</strong> ${report.metrics?.tasksCount || 0}</p>
            <p><strong>Время решения:</strong> ${Math.floor((report.metrics?.timeSpent || 0) / 1000 / 60)} минут</p>
            <p><strong>Дата генерации:</strong> ${formatDate(report.generatedAt)}</p>
        </div>

        ${report.taskHistory && report.taskHistory.length > 0 ? `
        <div class="report-section">
            <h2>История задач</h2>
            ${report.taskHistory.map((task, idx) => `
                <div style="margin-bottom: 20px; padding: 15px; background: #1e1e1e; border-radius: 4px;">
                    <h3 style="color: #4ec9b0; margin-bottom: 10px;">Задача ${idx + 1}: ${task.level || 'Не указан'}</h3>
                    ${task.description ? `<p style="margin-bottom: 10px;">${escapeHtml(task.description)}</p>` : ''}
                    ${task.testResults ? `
                        <p style="font-size: 14px; color: #858585;">
                            Тесты: ${task.testResults.visible?.filter(t => t.passed).length || 0}/${task.testResults.visible?.length || 0} видимых пройдено
                        </p>
                    ` : ''}
                </div>
            `).join('')}
        </div>
        ` : ''}

        ${report.chatHistory && report.chatHistory.length > 0 ? `
        <div class="report-section">
            <h2>История диалога</h2>
            ${report.chatHistory.map(msg => `
                <div style="margin-bottom: 15px; padding: 10px; background: #1e1e1e; border-radius: 4px; border-left: 3px solid ${msg.role === 'assistant' ? '#4ec9b0' : '#858585'};">
                    <strong style="color: ${msg.role === 'assistant' ? '#4ec9b0' : '#858585'};">
                        ${msg.role === 'assistant' ? 'Интервьюер' : 'Кандидат'}:
                    </strong>
                    <p style="margin-top: 5px;">${escapeHtml(msg.content)}</p>
                    ${msg.time ? `<p style="font-size: 12px; color: #858585; margin-top: 5px;">${msg.time}</p>` : ''}
                </div>
            `).join('')}
        </div>
        ` : ''}

        <div class="metadata">
            <p>Отчет сгенерирован: ${formatDate(report.generatedAt)}</p>
            <p>Платформа: AI Interviewer System</p>
        </div>
    </div>
</body>
</html>`;
}

// Make downloadReport available globally for onclick handlers
if (typeof window !== 'undefined') {
    window.downloadReport = downloadReport;
}

