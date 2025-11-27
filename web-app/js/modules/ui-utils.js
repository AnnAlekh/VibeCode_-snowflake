// UI utility functions module
import { escapeHtml as escapeHtmlUtil } from './utils.js';
import { interviewState } from './state.js';

const TOTAL_STAGES = 6;
const STAGE_LABELS = {
    1: 'Генерация задачи',
    2: 'Решение задачи',
    3: 'Анализ решения',
    4: 'Вопросы интервьюера',
    5: 'Вторая задача',
    6: 'Финальный отчет'
};

export function showNotification(message, type = 'info') {
    const notification = document.getElementById('status-notification');
    const icon = document.getElementById('status-icon');
    const messageEl = document.getElementById('status-message');
    
    if (!notification || !icon || !messageEl) return;
    
    notification.className = `status-notification ${type} show`;
    messageEl.textContent = message;
    
    const labels = {
        success: 'OK',
        error: 'ERR',
        info: 'INFO',
        warning: 'WARN'
    };
    icon.textContent = labels[type] || labels.info;
    
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

export function showLoading(message) {
    const container = document.getElementById('task-view');
    if (container) {
        container.innerHTML = `<div class="loading">${message}</div>`;
    }
}

export function showError(message) {
    const container = document.getElementById('task-view');
    if (container) {
        container.innerHTML = `<div class="loading" style="color: #ce9178;">${message}</div>`;
    }
    showNotification(message, 'error');
}

export function updateProgress(percentage) {
    const progressBar = document.getElementById('progress-bar');
    if (progressBar) {
        progressBar.style.width = `${percentage}%`;
    }
}

export function formatDuration(ms) {
    if (typeof ms !== 'number' || isNaN(ms)) {
        return '-';
    }
    const seconds = (ms / 1000).toFixed(1);
    return `${seconds}s`;
}

export function setStageDuration(stageNumber, durationMs) {
    const durationEl = document.getElementById(`stage-${stageNumber}-time`);
    if (!durationEl) return;
    if (durationMs === null || durationMs === undefined) {
        durationEl.textContent = '-';
        return;
    }
    durationEl.textContent = formatDuration(durationMs);
    // Сохраняем длительность в состоянии
    if (interviewState && interviewState.stageDurations) {
        interviewState.stageDurations[stageNumber] = durationMs;
    }
}

export function updateStage(stageNumber, status, durationMs = null) {
    const stage = document.getElementById(`stage-${stageNumber}`);
    if (!stage) return;
    
    const icon = stage.querySelector('.stage-icon');
    if (!icon) return;
    
    stage.className = `stage-item ${status}`;
    icon.className = `stage-icon ${status}`;
    
    if (status === 'completed') {
        icon.textContent = 'ok';
        interviewState.lastCompletedStage = Math.max(interviewState.lastCompletedStage || 0, stageNumber);
    } else if (status === 'active') {
        setStageDuration(stageNumber, null);
        icon.textContent = stageNumber;
        interviewState.currentStage = stageNumber;
    } else {
        setStageDuration(stageNumber, null);
        icon.textContent = stageNumber;
    }

    if (durationMs !== null) {
        setStageDuration(stageNumber, durationMs);
    }

    refreshCandidateInsights();
}

// Re-export escapeHtml for convenience
export { escapeHtmlUtil as escapeHtml };

export function refreshCandidateInsights() {
    if (typeof document === 'undefined') {
        return;
    }

    const completedStages = Object.values(interviewState.stageDurations || {}).filter(value => typeof value === 'number').length;
    const activeStage = interviewState.currentStage || Math.min(completedStages + 1, TOTAL_STAGES);
    const progressPercent = TOTAL_STAGES ? Math.min(100, Math.round((completedStages / TOTAL_STAGES) * 100)) : 0;

    const progressBar = document.getElementById('candidate-stage-progress-bar');
    if (progressBar) {
        progressBar.style.width = `${progressPercent}%`;
    }

    const progressLabel = document.getElementById('candidate-stage-progress-label');
    if (progressLabel) {
        progressLabel.textContent = `${completedStages}/${TOTAL_STAGES} этапов`;
    }

    const currentStageEl = document.getElementById('candidate-stage-current');
    if (currentStageEl) {
        currentStageEl.textContent = `Текущий этап: ${STAGE_LABELS[activeStage] || '—'}`;
    }

    const summary = interviewState.metrics?.testSummary || {};
    const totalTests = summary.total || 0;
    const testsTotalEl = document.getElementById('candidate-tests-total');
    const testsVisibleEl = document.getElementById('candidate-tests-visible');
    const testsHiddenEl = document.getElementById('candidate-tests-hidden');
    const testsMessageEl = document.getElementById('candidate-tests-message');
    const hintsEl = document.getElementById('candidate-hints-used');

    if (testsTotalEl) {
        testsTotalEl.textContent = totalTests ? `${summary.passed || 0}/${totalTests}` : '—';
    }
    if (testsVisibleEl) {
        const visibleTotal = summary.visibleTotal || 0;
        testsVisibleEl.textContent = visibleTotal ? `${summary.visiblePassed || 0}/${visibleTotal}` : '—';
    }
    if (testsHiddenEl) {
        const hiddenTotal = summary.hiddenTotal || 0;
        testsHiddenEl.textContent = hiddenTotal ? `${summary.hiddenPassed || 0}/${hiddenTotal}` : '—';
    }
    if (testsMessageEl) {
        if (!totalTests) {
            testsMessageEl.textContent = 'Запустите тесты, чтобы увидеть статистику';
        } else {
            const percent = Math.round(((summary.passed || 0) / totalTests) * 100);
            testsMessageEl.textContent = `Пройдено ${summary.passed || 0} из ${totalTests} (${percent}%)`;
        }
    }
    if (hintsEl) {
        const totalHints = interviewState.metrics?.hintsUsed || 0;
        const perTaskLimit = interviewState.hintLimitPerTask || 2;
        const taskHints = interviewState.currentTaskHintCount || 0;
        hintsEl.textContent = `Подсказки: ${totalHints} всего • текущая задача ${taskHints}/${perTaskLimit}`;
    }

    const history = interviewState.candidateHistory || [];
    const historyAverageEl = document.getElementById('candidate-history-average');
    const historyBestEl = document.getElementById('candidate-history-best');
    const historyTrendEl = document.getElementById('candidate-history-trend');
    const historyListEl = document.getElementById('candidate-history-list');

    if (historyAverageEl) {
        const avg = history.length ? Math.round(history.reduce((acc, entry) => acc + (entry.score || 0), 0) / history.length) : 0;
        historyAverageEl.textContent = history.length ? `${avg}` : '—';
    }
    if (historyBestEl) {
        const best = history.length ? Math.max(...history.map(entry => entry.score || 0)) : 0;
        historyBestEl.textContent = history.length ? `${best}` : '—';
    }
    if (historyTrendEl) {
        if (history.length < 2) {
            historyTrendEl.textContent = '—';
        } else {
            const last = history[history.length - 1]?.score || 0;
            const prev = history[history.length - 2]?.score || 0;
            const diff = last - prev;
            historyTrendEl.textContent = diff === 0 ? '0' : (diff > 0 ? `+${diff}` : `${diff}`);
        }
    }
    if (historyListEl) {
        if (!history.length) {
            historyListEl.innerHTML = '<li>История появится после завершения интервью</li>';
        } else {
            historyListEl.innerHTML = history
                .slice(-3)
                .reverse()
                .map(entry => {
                    const date = entry.generatedAt
                        ? new Date(entry.generatedAt).toLocaleDateString('ru-RU', { month: 'short', day: 'numeric' })
                        : '';
                    return `<li><span>${date}</span><span>${entry.score || 0} / 100</span></li>`;
                })
                .join('');
        }
    }
}

