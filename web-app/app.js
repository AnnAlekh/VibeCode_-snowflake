// Import modules for refactored structure
import { interviewState, adminState, adminDefaults } from './js/modules/state.js';
import { API_BASE, fetchWithTimeout } from './js/modules/api.js';
import { 
    showNotification, 
    showLoading, 
    showError, 
    updateProgress, 
    updateStage,
    escapeHtml,
    refreshCandidateInsights
} from './js/modules/ui-utils.js';
import { setActiveScreen } from './js/modules/screen-manager.js';
import { 
    initializeMonacoEditor, 
    getEditorCode,
    changeLanguage as changeEditorLanguage 
} from './js/modules/monaco-manager.js';
import {
    addChatMessage,
    showTypingIndicator,
    hideTypingIndicator,
    scrollChatToBottom,
    isChatAtBottom,
    getIsProcessingMessage,
    setIsProcessingMessage
} from './js/modules/chat-manager.js';
import {
    pauseTimer,
    resumeTimer,
    withLLM,
    updateMetrics,
    calculateAverageScore
} from './js/modules/metrics-manager.js';
import { displayTask, displayTestResults } from './js/modules/task-renderer.js';
import { showFinalReport, displayReport, downloadReport } from './js/modules/report-manager.js';
import {
    logger,
    logUserAction,
    logSystemEvent,
    logAPI,
    logStateChange,
    logError,
    logUI,
    logAntiCheat
} from './js/modules/logger.js';

// adminDefaults и adminState импортированы из './js/modules/state.js'
// API_BASE и fetchWithTimeout импортированы из './js/modules/api.js'
// initializeMonacoEditor импортирована из './js/modules/monaco-manager.js'
// setActiveScreen импортирована из './js/modules/screen-manager.js'

const modelRetryActions = {};
let modelRetryCounter = 0;

const DEFAULT_HINT_LIMIT = 2;
let hintRequestInProgress = false;

function initAntiCheatSystem() {
  if (!window.antiCheatSystem) {
    window.antiCheatSystem = new AntiCheatIntegration();
  }
}

// Получение отчета безопасности
function getSecurityReport() {
  if (window.antiCheatSystem) {
    return window.antiCheatSystem.getSecurityReport();
  }
  return null;
}

// Принудительный скриншот (для тестирования)
function takeSecurityScreenshot() {
  if (window.antiCheatSystem) {
    return window.antiCheatSystem.takeScreenshot();
  }
  return null;
}

function stripHiddenReasoning(text = '') {
    if (!text) {
        return '';
    }
    return text
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/<think>[\s\S]*$/gi, '')
        .replace(/<\/redacted_reasoning>/gi, '')
        .trim();
}

function getHintsPerTaskLimit() {
    return interviewState.hintLimitPerTask || DEFAULT_HINT_LIMIT;
}

function getCurrentTaskKey(task = interviewState.currentTask) {
    if (!task) {
        return null;
    }
    return task.id || task.taskId || task.title || `task-${interviewState.metrics.tasksCount || 0}`;
}

function formatHintWord(count) {
    if (count === 1) return 'подсказку';
    if (count >= 2 && count <= 4) return 'подсказки';
    return 'подсказок';
}

function ensureHintStateForTask(task = interviewState.currentTask) {
    if (!interviewState) return;
    if (!interviewState.hintUsageByTask) {
        interviewState.hintUsageByTask = {};
    }
    const key = getCurrentTaskKey(task);
    if (!key) {
        interviewState.currentTaskHintCount = 0;
        updateHintControls();
        return;
    }
    if (typeof interviewState.hintUsageByTask[key] !== 'number') {
        interviewState.hintUsageByTask[key] = 0;
    }
    interviewState.currentTaskHintCount = interviewState.hintUsageByTask[key];
    updateHintControls();
}

function setActiveQuestion(questionText = null, questionType = 'generic') {
    if (!interviewState) return;
    if (questionText && getCurrentTaskKey()) {
        interviewState.activeQuestion = {
            text: questionText,
            type: questionType,
            taskId: getCurrentTaskKey(),
            timestamp: Date.now()
        };
    } else {
        interviewState.activeQuestion = null;
    }
    updateHintControls();
}

function updateHintControls() {
    if (typeof document === 'undefined') {
        return;
    }
    const taskButton = document.getElementById('task-hint-btn');
    const questionButton = document.getElementById('question-hint-btn');
    const hintMeta = document.getElementById('hint-limit-meta');
    const limit = getHintsPerTaskLimit();
    const used = interviewState.currentTaskHintCount || 0;
    const remaining = Math.max(limit - used, 0);
    const hasTask = Boolean(interviewState.currentTask);
    const hasQuestion = Boolean(interviewState.activeQuestion?.text);

    if (taskButton) {
        taskButton.disabled = !hasTask || remaining <= 0 || hintRequestInProgress;
        taskButton.textContent = hasTask
            ? `Подсказка по задаче (${remaining}/${limit})`
            : 'Подсказка по задаче';
    }

    if (questionButton) {
        questionButton.disabled = !hasTask || !hasQuestion || remaining <= 0 || hintRequestInProgress;
        questionButton.textContent = hasQuestion
            ? `Подсказка по вопросу (${remaining}/${limit})`
            : 'Подсказка по вопросу';
    }

    if (hintMeta) {
        if (!hasTask) {
            hintMeta.textContent = 'Задача еще не сгенерирована';
        } else if (remaining > 0) {
            hintMeta.textContent = `Можно получить еще ${remaining} ${formatHintWord(remaining)} на текущую задачу`;
        } else {
            hintMeta.textContent = 'Лимит подсказок для этой задачи исчерпан';
        }
    }
}

function recordManualHintUsage() {
    const key = getCurrentTaskKey();
    if (!key) {
        return;
    }
    if (!interviewState.hintUsageByTask) {
        interviewState.hintUsageByTask = {};
    }
    interviewState.hintUsageByTask[key] = (interviewState.hintUsageByTask[key] || 0) + 1;
    interviewState.currentTaskHintCount = interviewState.hintUsageByTask[key];
    interviewState.metrics.hintsUsed = (interviewState.metrics.hintsUsed || 0) + 1;
    refreshCandidateInsights();
    updateHintControls();
}

async function requestHint(type = 'task') {
    const normalizedType = type === 'question' ? 'question' : 'task';
    if (hintRequestInProgress) {
        return;
    }
    if (!interviewState.currentTask) {
        showNotification('Задача еще не сгенерирована', 'warning');
        return;
    }
    const limit = getHintsPerTaskLimit();
    const used = interviewState.currentTaskHintCount || 0;
    if (used >= limit) {
        showNotification('Лимит подсказок для этой задачи уже исчерпан', 'warning');
        return;
    }
    if (normalizedType === 'question' && !interviewState.activeQuestion?.text) {
        showNotification('Подсказку по вопросу можно запросить только после вопроса интервьюера', 'warning');
        return;
    }

    hintRequestInProgress = true;
    updateHintControls();
    showTypingIndicator();

    try {
        showNotification('Генерация подсказки...', 'info');
        const payload = {
            type: normalizedType,
            task: interviewState.currentTask,
            code: normalizedType === 'task' && interviewState.editor ? interviewState.editor.getValue() : undefined,
            question: normalizedType === 'question' ? interviewState.activeQuestion?.text : undefined,
            chatHistory: interviewState.chatHistory.slice(-6),
            analysis: interviewState.taskHistory[interviewState.taskHistory.length - 1]?.analysis || null
        };

        const response = await fetchWithTimeout(
            `${API_BASE}/hints/generate`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            },
            {},
            120000
        );

        if (!response.ok) {
            const errorPayload = await response.json().catch(() => ({}));
            throw new Error(errorPayload.error || 'Не удалось получить подсказку');
        }

        const data = await response.json();
        const hintText = (data.hint || data.message || '').trim();
        const sanitizedHint = stripHiddenReasoning(hintText);
        if (!sanitizedHint) {
            throw new Error('Модель вернула пустую подсказку');
        }

        addChatMessage('assistant', `💡 Подсказка: ${sanitizedHint}`);
        recordManualHintUsage();
    } catch (error) {
        console.error('Hint request failed:', error);
        showNotification(`Не удалось получить подсказку: ${error.message}`, 'error');
    } finally {
        hintRequestInProgress = false;
        updateHintControls();
        hideTypingIndicator();
    }
}

function clearModelRetryOptions() {
    Object.keys(modelRetryActions).forEach(key => delete modelRetryActions[key]);
    const container = document.getElementById('model-retry-container');
    if (container) {
        container.innerHTML = '';
        container.classList.add('hidden');
    }
}

function showModelRetryOption(message, handler, buttonLabel = 'Обновить ответ модели') {
    const container = document.getElementById('model-retry-container');
    if (!container) {
        return null;
    }
    clearModelRetryOptions();
    const actionId = `model-retry-${Date.now()}-${modelRetryCounter++}`;
    modelRetryActions[actionId] = handler;
    container.innerHTML = `
        <div class="model-retry-message">
            <div class="model-retry-text">${escapeHtml(message)}</div>
            <button class="btn btn-run" onclick="retryModelAction('${actionId}')">${buttonLabel}</button>
        </div>
    `;
    container.classList.remove('hidden');
    return actionId;
}

async function retryModelAction(actionId) {
    const handler = modelRetryActions[actionId];
    if (!handler) {
        return;
    }
    clearModelRetryOptions();
    try {
        await handler();
    } catch (error) {
        console.error('Retry failed:', error);
        showNotification(`Не удалось повторить запрос: ${error.message}`, 'error');
        showModelRetryOption('Модель снова вернула ошибку. Попробуйте еще раз.', handler);
    }
}

function clampMetric(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

const ANTI_CHEAT_BASE_PENALTY = 8;
const ANTI_CHEAT_EVENT_WEIGHT = 3;
const ANTI_CHEAT_TYPE_WEIGHT = 2;
const ANTI_CHEAT_MAX_PENALTY = 35;

function computeAntiCheatPenalty(events = []) {
    if (!Array.isArray(events) || !events.length) {
        return {
            value: 0,
            severity: 'none',
            eventTypes: [],
            eventsCount: 0
        };
    }

    const eventTypes = [...new Set(events.map(evt => evt.type || 'unknown'))];
    const incrementalPenalty = Math.min(Math.max(events.length - 1, 0), 5) * ANTI_CHEAT_EVENT_WEIGHT;
    const diversityPenalty = Math.max(eventTypes.length - 1, 0) * ANTI_CHEAT_TYPE_WEIGHT;
    const rawPenalty = ANTI_CHEAT_BASE_PENALTY + incrementalPenalty + diversityPenalty;
    const value = clampMetric(rawPenalty, 0, ANTI_CHEAT_MAX_PENALTY);

    let severity = 'low';
    if (value >= 25) {
        severity = 'critical';
    } else if (value >= 15) {
        severity = 'high';
    } else if (value >= 8) {
        severity = 'medium';
    }

    return {
        value,
        severity,
        eventTypes,
        eventsCount: events.length
    };
}

function recalculateInterviewMetrics(reason = 'manual') {
    const baseScore = calculateAverageScore();
    const penalty = computeAntiCheatPenalty(interviewState.antiCheatEvents || []);
    const previousPenaltyValue = interviewState.metrics?.antiCheatPenalty?.value || 0;
    interviewState.metrics.overallScore = clampMetric(baseScore - penalty.value, 0, 100);
    interviewState.metrics.antiCheatPenalty = {
        ...penalty,
        baseScore,
        adjustedScore: interviewState.metrics.overallScore,
        reason
    };

    if (penalty.value > previousPenaltyValue) {
        showNotification('Обнаружены подозрительные действия. Оценка скорректирована.', 'warning');
    }

    if (penalty.value || previousPenaltyValue) {
        logSystemEvent('metrics-recalculated', {
            reason,
            baseScore,
            adjustedScore: interviewState.metrics.overallScore,
            penalty: penalty.value,
            events: penalty.eventsCount
        });
    }
}

function getScoreTrendDirection() {
    const history = Array.isArray(interviewState.evaluationHistory) ? interviewState.evaluationHistory : [];
    if (history.length < 2) {
        return 'insufficient-data';
    }
    const last = history[history.length - 1].score ?? 0;
    const prev = history[history.length - 2].score ?? 0;

    if (last - prev >= 5) {
        return 'improving';
    }
    if (prev - last >= 5) {
        return 'declining';
    }
    return 'stable';
}

function recordEvaluationResult(questionType, evaluation) {
    if (!Array.isArray(interviewState.evaluationHistory)) {
        interviewState.evaluationHistory = [];
    }
    interviewState.evaluationHistory.push({
        type: questionType,
        score: Number(evaluation.score) || 0,
        understanding: Number(evaluation.understanding) || 0,
        communication: Number(evaluation.communication) || 0,
        isSufficient: typeof evaluation.isSufficient === 'boolean' ? evaluation.isSufficient : null,
        timestamp: Date.now()
    });
    interviewState.evaluationHistory = interviewState.evaluationHistory.slice(-10);
}

function buildEvaluationContext(questionType = 'follow-up') {
    const lastTaskEntry = interviewState.taskHistory[interviewState.taskHistory.length - 1] || {};
    const activeTask = interviewState.currentTask || lastTaskEntry.task || {};
    return {
        questionType,
        task: {
            id: activeTask?.id || lastTaskEntry.task?.id || null,
            level: activeTask?.level || interviewState.currentLevel,
            title: activeTask?.title || null,
            description: activeTask?.description || activeTask?.task || '',
            requirements: activeTask?.requirements || [],
            constraints: activeTask?.constraints || [],
            expectedComplexity: activeTask?.expectedComplexity || ''
        },
        analysis: lastTaskEntry.analysis || {},
        testResults: lastTaskEntry.testResults || {},
        metrics: {
            tasksCount: interviewState.metrics.tasksCount,
            timeSpentSeconds: interviewState.metrics.timeSpent,
            hintsUsed: interviewState.metrics.hintsUsed,
            attemptsForCurrentTask: interviewState.currentTaskAttempts,
            additionalQuestionsAsked: interviewState.additionalQuestionsCount,
            scoreTrend: getScoreTrendDirection(),
            recentEvaluations: (interviewState.evaluationHistory || []).slice(-3)
        },
        stageDurations: interviewState.stageDurations || {},
        antiCheat: {
            eventsDetected: interviewState.antiCheatEvents?.length || 0
        }
    };
}

function getAdaptiveThresholds(evaluation = {}) {
    const trend = getScoreTrendDirection();
    let scoreThreshold = 70;
    let understandingThreshold = 70;
    let communicationThreshold = 70;

    if (trend === 'improving') {
        scoreThreshold -= 5;
        understandingThreshold -= 5;
    } else if (trend === 'declining') {
        scoreThreshold += 5;
    }

    if ((interviewState.currentTaskAttempts || 0) > 1 || interviewState.additionalQuestionsCount > 1) {
        scoreThreshold += 5;
        understandingThreshold += 5;
    }

    if ((evaluation.communication || 0) >= 85) {
        communicationThreshold -= 5;
    }

    scoreThreshold = clampMetric(scoreThreshold, 60, 80);
    understandingThreshold = clampMetric(understandingThreshold, 60, 80);
    communicationThreshold = clampMetric(communicationThreshold, 60, 80);

    return {
        score: scoreThreshold,
        understanding: understandingThreshold,
        communication: communicationThreshold,
        combined: Math.round(
            scoreThreshold * 0.6 +
            understandingThreshold * 0.3 +
            communicationThreshold * 0.1
        )
    };
}

function isAnswerSufficient(evaluation) {
    if (typeof evaluation.isSufficient === 'boolean') {
        return evaluation.isSufficient;
    }
    const thresholds = getAdaptiveThresholds(evaluation);
    const score = Number(evaluation.score) || 0;
    const understanding = Number(evaluation.understanding) || 0;
    const communication = Number(evaluation.communication) || 0;
    const combined = Math.round(
        score * 0.6 +
        understanding * 0.3 +
        communication * 0.1
    );

    return (
        score >= thresholds.score &&
        understanding >= thresholds.understanding &&
        communication >= thresholds.communication &&
        combined >= thresholds.combined
    );
}

function maybeSendAnswerQualityTip(evaluation) {
    const tips = [];
    if ((evaluation.communication || 0) < 70) {
        tips.push('Сформулируйте ответ в формате: идея → шаги решения → вывод по сложности, это помогает показать структуру мысли.');
    }
    if ((evaluation.understanding || 0) < 70) {
        tips.push('Подкрепляйте объяснение ссылкой на конкретные строки кода и проговаривайте обработку граничных случаев.');
    }
    if ((evaluation.score || 0) < 70) {
        tips.push('Привяжите ответ к задаче: объясните выбор структуры данных и почему он оптимален.');
    }
    if (!tips.length) {
        return;
    }
    addChatMessage('assistant', `Совет: ${tips[0]}`);
}

const ANTI_CHEAT_SYNC_INTERVAL = 15000; // 15 секунд
let antiCheatStatusInterval = null;

function ensureAdminAntiCheatConfig() {
    if (!adminState.settings) {
        adminState.settings = JSON.parse(JSON.stringify(adminDefaults.settings));
    }
    if (!adminState.settings.antiCheat) {
        adminState.settings.antiCheat = { ...(adminDefaults.settings?.antiCheat || {}) };
    }
}

function setAntiCheatEnabled(enabled) {
    const normalized = enabled !== false;
    const previousValue = interviewState.antiCheatEnabled;
    interviewState.antiCheatEnabled = normalized;

    ensureAdminAntiCheatConfig();
    adminState.settings.antiCheat.enabled = normalized;

    const checkbox = document.getElementById('antiCheatEnabled');
    if (checkbox) {
        checkbox.checked = normalized;
    }

    const stateChanged = previousValue !== normalized;
    if (stateChanged) {
        setupAntiCheatTracking();
    }
    updateAntiCheatToggleUI();

    return normalized;
}

function getCandidateDataset() {
    if (Array.isArray(adminState.candidates) && adminState.candidates.length) {
        return adminState.candidates;
    }
    return adminDefaults.candidates || [];
}

function calculateCandidateMetricsSummary() {
    const candidates = getCandidateDataset();
    if (!candidates.length) {
        return {
            totalCandidates: 0,
            avgOverall: 0,
            avgTechnical: 0,
            avgCommunication: 0,
            approvalRate: 0,
            statusDistribution: {},
            levelStats: [],
            topPerformers: [],
            riskCandidates: []
        };
    }

    const totals = candidates.reduce(
        (acc, candidate) => {
            acc.overall += Number(candidate.overall) || 0;
            acc.technical += Number(candidate.technical) || 0;
            acc.communication += Number(candidate.communication) || 0;
            return acc;
        },
        { overall: 0, technical: 0, communication: 0 }
    );

    const statusDistribution = candidates.reduce((acc, candidate) => {
        const key = candidate.status || 'unknown';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});

    const levelMap = candidates.reduce((acc, candidate) => {
        const level = candidate.level || 'Не указан';
        if (!acc[level]) {
            acc[level] = { count: 0, overall: 0, technical: 0, communication: 0 };
        }
        acc[level].count += 1;
        acc[level].overall += Number(candidate.overall) || 0;
        acc[level].technical += Number(candidate.technical) || 0;
        acc[level].communication += Number(candidate.communication) || 0;
        return acc;
    }, {});

    const levelStats = Object.entries(levelMap).map(([level, data]) => ({
        level,
        count: data.count,
        avgOverall: Math.round(data.overall / data.count) || 0,
        avgTechnical: Math.round(data.technical / data.count) || 0,
        avgCommunication: Math.round(data.communication / data.count) || 0
    }));

    const topPerformers = [...candidates]
        .filter(candidate => typeof candidate.overall === 'number')
        .sort((a, b) => (b.overall || 0) - (a.overall || 0))
        .slice(0, 3);

    const riskCandidates = candidates
        .filter(candidate => (candidate.status === 'review' || candidate.status === 'rejected' || (candidate.overall || 0) < 60))
        .slice(0, 3);

    const totalCandidates = candidates.length;
    const approvalRate = totalCandidates
        ? Math.round(((statusDistribution.approved || 0) / totalCandidates) * 100)
        : 0;

    return {
        totalCandidates,
        avgOverall: Math.round(totals.overall / totalCandidates) || 0,
        avgTechnical: Math.round(totals.technical / totalCandidates) || 0,
        avgCommunication: Math.round(totals.communication / totalCandidates) || 0,
        approvalRate,
        statusDistribution,
        levelStats,
        topPerformers,
        riskCandidates
    };
}

function renderCandidateMetricsReport() {
    const container = document.getElementById('candidate-metrics-report');
    if (!container) {
        return;
    }

    const summary = calculateCandidateMetricsSummary();
    if (!summary.totalCandidates) {
        container.innerHTML = '<p class="muted">Недостаточно данных о кандидатах для построения отчета.</p>';
        return;
    }

    const statusBadges = Object.entries(summary.statusDistribution)
        .map(([status, count]) => `
            <div class="metric-chip">
                <span>${escapeHtml(status)}</span>
                <strong>${count}</strong>
            </div>
        `).join('');

    const levelRows = summary.levelStats
        .map(level => `
            <tr>
                <td>${escapeHtml(level.level)}</td>
                <td>${level.count}</td>
                <td>${level.avgOverall}</td>
                <td>${level.avgTechnical}</td>
                <td>${level.avgCommunication}</td>
            </tr>
        `).join('');

    const performerList = summary.topPerformers.length
        ? summary.topPerformers.map(candidate => `
            <li>
                <strong>${escapeHtml(candidate.name || 'Кандидат')}</strong>
                <span>${candidate.level || '—'} • ${candidate.overall || 0} баллов</span>
            </li>
        `).join('')
        : '<li>Нет завершенных интервью</li>';

    const riskList = summary.riskCandidates.length
        ? summary.riskCandidates.map(candidate => `
            <li>
                <strong>${escapeHtml(candidate.name || 'Кандидат')}</strong>
                <span>${candidate.status || '—'} • ${candidate.overall || 0} баллов</span>
            </li>
        `).join('')
        : '<li>Рисковые кандидаты не выявлены</li>';

    container.innerHTML = `
        <div class="metrics-card-grid">
            <div class="metric-card highlight">
                <p>Кандидатов</p>
                <h3>${summary.totalCandidates}</h3>
            </div>
            <div class="metric-card">
                <p>Средний итоговый балл</p>
                <h3>${summary.avgOverall}</h3>
            </div>
            <div class="metric-card">
                <p>Техника</p>
                <h3>${summary.avgTechnical}</h3>
            </div>
            <div class="metric-card">
                <p>Коммуникации</p>
                <h3>${summary.avgCommunication}</h3>
            </div>
            <div class="metric-card">
                <p>Одобрено</p>
                <h3>${summary.approvalRate}%</h3>
            </div>
        </div>
        <div class="status-distribution">
            ${statusBadges || '<p class="muted">Нет данных по статусам</p>'}
        </div>
        <div class="metrics-table-wrapper">
            <table class="metrics-table">
                <thead>
                    <tr>
                        <th>Уровень</th>
                        <th>Кандидатов</th>
                        <th>Итог</th>
                        <th>Техника</th>
                        <th>Коммуникации</th>
                    </tr>
                </thead>
                <tbody>
                    ${levelRows || '<tr><td colspan="5">Нет данных</td></tr>'}
                </tbody>
            </table>
        </div>
        <div class="metrics-columns">
            <div>
                <h4>Лучшие кандидаты</h4>
                <ul class="metrics-list">
                    ${performerList}
                </ul>
            </div>
            <div>
                <h4>Нуждаются в проверке</h4>
                <ul class="metrics-list warning">
                    ${riskList}
                </ul>
            </div>
        </div>
    `;
}

function extractReasoningBlocks(rawText) {
    if (!rawText) return [];
    const normalized = rawText
        .replace(/<redacted_reasoning>/gi, '<think>')
        .replace(/<\/redacted_reasoning>/gi, '</think>');

    const blocks = [];
    const regex = /<think>([\s\S]*?)<\/think>/gi;
    let match;
    while ((match = regex.exec(normalized)) !== null) {
        const chunk = match[1].trim();
        if (chunk) {
            blocks.push(chunk);
        }
    }
    return blocks;
}

function generateTransparencyProtocol() {
    const timeline = [];
    const reasoningAccumulator = [];

    (interviewState.taskHistory || []).forEach((entry, index) => {
        timeline.push({
            type: 'task',
            timestamp: entry.timestamp || Date.now(),
            label: `Задача ${index + 1}`,
            level: entry.level || entry.task?.level,
            content: entry.task?.title || entry.task?.description || 'Описание недоступно',
            analysis: entry.analysis || null
        });
    });

    (interviewState.chatHistory || []).forEach((message) => {
        const reasoningBlocks = extractReasoningBlocks(message.rawContent || message.content);
        if (reasoningBlocks.length) {
            reasoningAccumulator.push(...reasoningBlocks);
        }
        timeline.push({
            type: 'chat',
            timestamp: message.timestamp || Date.now(),
            role: message.role,
            label: message.role === 'assistant' ? 'Интервьюер' : 'Кандидат',
            content: message.content,
            rawContent: message.rawContent,
            reasoning: reasoningBlocks,
            time: message.time || new Date(message.timestamp || Date.now()).toLocaleTimeString()
        });
    });

    const logs = logger.getLogs() || [];
    logs.forEach((log) => {
        const ts = Date.parse(log.timestamp) || (Date.now() - log.timeSinceStart || 0);
        timeline.push({
            type: 'log',
            timestamp: ts,
            label: `[${log.category}]`,
            content: log.message,
            level: log.level,
            data: log.data
        });
    });

    timeline.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

    const summary = {
        tasksCompleted: interviewState.metrics?.tasksCount || 0,
        avgScore: interviewState.metrics?.overallScore || 0,
        chatMessages: interviewState.chatHistory?.length || 0,
        logEntries: logs.length,
        reasoningBlocks: reasoningAccumulator.length,
        warnings: logs.filter(l => l.level === 'warning').length,
        errors: logs.filter(l => l.level === 'error').length
    };

    return { summary, timeline };
}

function formatProtocolEntry(entry) {
    const timeLabel = entry.time || new Date(entry.timestamp || Date.now()).toLocaleTimeString();
    if (entry.type === 'task') {
        return `
            <div class="protocol-entry task-entry">
                <div class="protocol-entry-header">
                    <span>${timeLabel}</span>
                    <strong>${escapeHtml(entry.label)}</strong>
                </div>
                <p>${escapeHtml(entry.content || '')}</p>
                ${entry.level ? `<p class="muted">Уровень: ${escapeHtml(entry.level)}</p>` : ''}
                ${entry.analysis ? `
                    <details>
                        <summary>Внутренние оценки</summary>
                        <pre>${escapeHtml(JSON.stringify(entry.analysis, null, 2))}</pre>
                    </details>
                ` : ''}
            </div>
        `;
    }

    if (entry.type === 'chat') {
        return `
            <div class="protocol-entry chat-entry ${entry.role}">
                <div class="protocol-entry-header">
                    <span>${timeLabel}</span>
                    <strong>${escapeHtml(entry.label)}</strong>
                </div>
                <p>${escapeHtml(entry.content || '')}</p>
                ${entry.reasoning && entry.reasoning.length ? `
                    <details>
                        <summary>Рассуждения модели</summary>
                        ${entry.reasoning.map(block => `<pre>${escapeHtml(block)}</pre>`).join('')}
                    </details>
                ` : ''}
            </div>
        `;
    }

    return `
        <div class="protocol-entry log-entry ${entry.level}">
            <div class="protocol-entry-header">
                <span>${timeLabel}</span>
                <strong>${escapeHtml(entry.label)}</strong>
            </div>
            <p>${escapeHtml(entry.content || '')}</p>
            ${entry.data ? `<pre>${escapeHtml(JSON.stringify(entry.data, null, 2))}</pre>` : ''}
        </div>
    `;
}

function renderTransparencyProtocol() {
    const container = document.getElementById('transparency-protocol');
    if (!container) {
        return;
    }

    const protocol = generateTransparencyProtocol();
    if (!protocol.timeline.length) {
        container.innerHTML = '<p class="muted">Протокол появится после начала интервью.</p>';
        return;
    }

    container.innerHTML = `
        <div class="metrics-card-grid protocol-summary">
            <div class="metric-card">
                <p>Задач завершено</p>
                <h3>${protocol.summary.tasksCompleted}</h3>
            </div>
            <div class="metric-card">
                <p>Средний балл</p>
                <h3>${protocol.summary.avgScore}</h3>
            </div>
            <div class="metric-card">
                <p>Сообщений в чате</p>
                <h3>${protocol.summary.chatMessages}</h3>
            </div>
            <div class="metric-card">
                <p>Логов</p>
                <h3>${protocol.summary.logEntries}</h3>
            </div>
            <div class="metric-card">
                <p>Рассуждений модели</p>
                <h3>${protocol.summary.reasoningBlocks}</h3>
            </div>
        </div>
        <div class="protocol-timeline">
            ${protocol.timeline.map(formatProtocolEntry).join('')}
        </div>
    `;
}

function downloadTransparencyProtocol() {
    const protocol = generateTransparencyProtocol();
    const payload = {
        generatedAt: new Date().toISOString(),
        candidateLevel: interviewState.currentLevel,
        metrics: interviewState.metrics,
        timeline: protocol.timeline
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transparency-protocol-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function isAdminPanelActive() {
    const adminPanel = document.getElementById('admin-panel');
    return adminPanel?.classList.contains('active');
}

async function refreshAntiCheatStatus() {
    if (isAdminPanelActive()) {
        // Не перезаписываем состояние, если пользователь редактирует настройки в админке
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/admin/settings`, { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`Ошибка проверки античита: ${response.status}`);
        }

        const latestSettings = await response.json();
        ensureAdminAntiCheatConfig();
        adminState.settings = {
            ...adminState.settings,
            ...latestSettings,
            antiCheat: {
                ...(adminDefaults.settings?.antiCheat || {}),
                ...(adminState.settings.antiCheat || {}),
                ...(latestSettings?.antiCheat || {})
            }
        };
        setAntiCheatEnabled(adminState.settings.antiCheat?.enabled);
    } catch (error) {
        console.warn('Не удалось обновить статус античита', error);
    }
}

function startAntiCheatStatusWatcher() {
    refreshAntiCheatStatus();
    if (antiCheatStatusInterval) {
        clearInterval(antiCheatStatusInterval);
    }
    antiCheatStatusInterval = setInterval(refreshAntiCheatStatus, ANTI_CHEAT_SYNC_INTERVAL);
}

function openAdminPanel() {
    logUserAction('openAdminPanel');
    logUI('screen', 'switch', { from: interviewState.stage, to: 'admin-panel' });
    setActiveScreen('admin-panel');
    if (!adminState.tasks.length && !adminState.loading) {
        loadAdminData();
    } else {
        renderAdminPanel();
    }
}

function returnToCandidate() {
    if (interviewState.currentLevel) {
        setActiveScreen('interview-screen');
    } else {
        setActiveScreen('level-selector');
    }
}

function syncAdminState() {
    loadAdminData(true);
}

async function loadAdminData(force = false) {
    if (adminState.loading && !force) {
        return;
    }

    adminState.loading = true;
    adminState.error = null;
    renderAdminPanel();

    try {
        const response = await fetch(`${API_BASE}/admin/overview`, { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`Ошибка загрузки админ-данных: ${response.status}`);
        }
        const data = await response.json();
        adminState.tasks = data.tasks || [];
        adminState.sessions = data.sessions || [];
        adminState.candidates = data.candidates || [];
        adminState.settings = data.settings || JSON.parse(JSON.stringify(adminDefaults.settings));
        adminState.stats = data.stats || adminDefaults.stats;
        adminState.reports = data.reports || [];
        adminState.antiCheatEvents = data.antiCheatEvents || adminDefaults.antiCheatEvents;
        adminState.lastSync = new Date().toISOString();
        
        // Устанавливаем состояние античита из настроек админ-панели
        setAntiCheatEnabled(adminState.settings?.antiCheat?.enabled);
        
        showNotification('Данные админ-панели синхронизированы', 'success');
    } catch (error) {
        console.error(error);
        adminState.error = error.message;
        if (!adminState.tasks.length) {
            adminState.tasks = adminDefaults.tasks;
            adminState.sessions = adminDefaults.sessions;
            adminState.candidates = adminDefaults.candidates;
            adminState.settings = JSON.parse(JSON.stringify(adminDefaults.settings));
            adminState.stats = adminDefaults.stats;
            adminState.reports = adminDefaults.reports;
            adminState.antiCheatEvents = adminDefaults.antiCheatEvents;
        }
        // Устанавливаем состояние античита из дефолтных настроек
        setAntiCheatEnabled(adminState.settings?.antiCheat?.enabled);
        showNotification('Не удалось получить данные админ-панели. Используются локальные данные.', 'warning');
    } finally {
        adminState.loading = false;
        renderAdminPanel();
    }
}

async function startInterview(level) {
    initAntiCheatSystem();
    logUserAction('startInterview', { level });
    logStateChange('interview', { stage: interviewState.stage }, { stage: 'interview', level });
    clearModelRetryOptions();
    
    interviewState.currentLevel = level;
    interviewState.additionalQuestionsCount = 0; // Сбрасываем счетчик вопросов
    interviewState.currentTaskAttempts = 0;
    interviewState.antiCheatEvents = [];
    interviewState.stage = 'interview';
    interviewState.metrics.startTime = Date.now();
    interviewState.metrics.pausedTime = 0;
    interviewState.metrics.lastPauseStart = null;
    ensureHintStateForTask(null);
    setActiveQuestion(null);
    interviewState.metrics.overallScore = 0;
    interviewState.metrics.antiCheatPenalty = null;

    // Переключение экранов
    logUI('screen', 'switch', { from: 'level-selector', to: 'interview-screen' });
    setActiveScreen('interview-screen');
    
    // Обновляем статус античита
    updateAntiCheatStatus();
    
    // Инициализируем Monaco Editor после переключения экрана
    setTimeout(() => {
        logSystemEvent('monaco-editor-init');
        initializeMonacoEditor();
    }, 100);

    startTimer();
    updateMetrics();
    logSystemEvent('interview-started', { level, timestamp: interviewState.metrics.startTime });

    await generateFirstTask(level);
}

// Export startInterview to window immediately after definition
if (typeof window !== 'undefined') {
    window.startInterview = startInterview;
    window.requestHint = requestHint;
}

updateHintControls();

async function generateFirstTask(level) {
    logSystemEvent('generateFirstTask-start', { level });
    clearModelRetryOptions();
    try {
        updateStage(1, 'active');
        updateProgress(10);
        showNotification('Генерация первой задачи...', 'info');
        showLoading('Генерация задачи...');
        
        const { result: task, duration } = await withLLM(async () => {
            const response = await fetch(`${API_BASE}/tasks/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    level: level,
                    topic: 'arrays',
                    language: 'python'
                })
            });
    
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
    
            return await response.json();
        });
        
        logSystemEvent('task-generated', { 
            level, 
            taskId: task.id || 'unknown',
            duration,
            hasDescription: !!task.description,
            hasExamples: !!task.examples
        });
        
        interviewState.currentTask = task;
        interviewState.currentTaskAttempts = 0;
        ensureHintStateForTask(task);
        setActiveQuestion(null);
        displayTask(task);
        
        updateStage(1, 'completed', duration);
        updateStage(2, 'active');
        updateProgress(20);
        showNotification('Задача сгенерирована!', 'success');
        
        addChatMessage('assistant', 'Привет! Я ваш интервьюер. Давайте начнем с первой задачи. Прочитайте условие и напишите решение.', duration);
    } catch (error) {
        logError(error, 'generateFirstTask');
        console.error('Error generating task:', error);
        addChatMessage('assistant', 'Ошибка при генерации задачи. Убедитесь, что backend сервер запущен на http://localhost:3000');
        showError('Не удалось подключиться к серверу. Убедитесь, что backend запущен.');
        showModelRetryOption('Не удалось сгенерировать задачу. Обновить ответ модели?', () => generateFirstTask(level));
    }
}

// displayTask и displayTestResults импортированы из './js/modules/task-renderer.js'

// Запуск кода
async function runCode() {
    const code = interviewState.editor.getValue();
    if (!code.trim()) {
        logUserAction('runCode', { error: 'empty_code' });
        showNotification('Напишите код перед запуском!', 'warning');
        return;
    }

    logUserAction('runCode', { 
        codeLength: code.length,
        language: document.getElementById('language-select')?.value || 'python'
    });

    try {
        showNotification('Запуск тестов...', 'info');
        const response = await fetch(`${API_BASE}/tests/run`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                code: code,
                task: interviewState.currentTask,
                language: 'python'
            })
        });

        const results = await response.json();
        logSystemEvent('tests-run-completed', {
            visibleTests: results.visible?.length || 0,
            hiddenTests: results.hidden?.length || 0,
            visiblePassed: results.visible?.every(t => t.passed) || false
        });
        
        displayTestResults(results);
        
        const visibleCases = Array.isArray(results.visible) ? results.visible : [];
        const allPassed = visibleCases.length && visibleCases.every(t => t.passed);
        if (allPassed) {
            showNotification('Все видимые тесты пройдены!', 'success');
        } else {
            showNotification('Некоторые тесты не пройдены', 'warning');
        }
    } catch (error) {
        logError(error, 'runCode');
        console.error('Error running tests:', error);
        showNotification('Ошибка при запуске тестов', 'error');
    }
}

// displayTestResults импортирована из './js/modules/task-renderer.js'

async function executeManualRun() {
    if (!interviewState.editor) return;
    const code = interviewState.editor.getValue();
    if (!code.trim()) {
        showNotification('Введите код перед запуском', 'warning');
        return;
    }
    const language = document.getElementById('language-select').value;
    const input = document.getElementById('runtime-input').value;
    const statusEl = document.getElementById('runtime-status');
    const outputEl = document.getElementById('runtime-output');

    if (statusEl) statusEl.textContent = 'Выполнение...';
    if (outputEl) outputEl.textContent = '';

    try {
        const response = await fetch(`${API_BASE}/runtime/run`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, language, input })
        });

        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || 'Не удалось выполнить код');
        }

        if (outputEl) {
            const stdout = result.stdout || '';
            const stderr = result.stderr ? `\nstderr:\n${result.stderr}` : '';
            outputEl.textContent = `${stdout}${stderr}`.trim() || 'Вывода нет';
        }

        if (statusEl) {
            const timeInfo = typeof result.executionTime === 'number'
                ? `Время: ${(result.executionTime / 1000).toFixed(2)} c`
                : '';
            statusEl.textContent = result.timedOut
                ? `${timeInfo} (превышен лимит)`
                : timeInfo;
        }
    } catch (error) {
        console.error('Manual run failed', error);
        if (statusEl) statusEl.textContent = 'Ошибка';
        if (outputEl) outputEl.textContent = error.message;
    }
}

function formatAttemptsWord(count) {
    if (count === 1) return 'попытка';
    if (count >= 2 && count <= 4) return 'попытки';
    return 'попыток';
}

async function handleHiddenTestFailure({ code, hiddenCases }) {
    const maxAttempts = interviewState.maxAttemptsPerTask ?? 0;
    const attemptsUsed = interviewState.currentTaskAttempts ?? 0;

    if (attemptsUsed >= maxAttempts) {
        showNotification('Лимит попыток исправления исчерпан. Переходим к оценке решения.', 'error');
        return true;
    }

    const attemptNumber = attemptsUsed + 1;
    const attemptsLeft = Math.max(maxAttempts - attemptNumber, 0);
    showNotification(
        `Скрытые тесты не пройдены. Попытка ${attemptNumber}/${maxAttempts}.`,
        attemptsLeft ? 'warning' : 'error'
    );

    let errorAnalysis = null;
    try {
        const errorResponse = await fetch(`${API_BASE}/solutions/analyze-error`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                code,
                task: interviewState.currentTask,
                failedTests: (hiddenCases || []).filter(test => !test.passed),
                visiblePassed: true
            })
        });

        if (!errorResponse.ok) {
            throw new Error(`Ошибка анализа скрытых тестов: ${errorResponse.status}`);
        }

        errorAnalysis = await errorResponse.json();
    } catch (error) {
        logError(error, 'handleHiddenTestFailure');
    }

    const attemptsLeftText = attemptsLeft
        ? `Осталось ${attemptsLeft} ${formatAttemptsWord(attemptsLeft)}.`
        : 'Попытки исправления исчерпаны. Следующая отправка завершит задачу.';

    if (errorAnalysis) {
        addChatMessage(
            'assistant',
            `Анализ ошибки (попытка ${attemptNumber}/${maxAttempts}):\n\n${errorAnalysis.explanation}\n\nПодсказка: ${errorAnalysis.suggestedFix}\n\n${attemptsLeftText}`
        );
        interviewState.metrics.hintsUsed = (interviewState.metrics.hintsUsed || 0) + 1;
        refreshCandidateInsights();
    } else {
        addChatMessage(
            'assistant',
            `Скрытые тесты не пройдены (попытка ${attemptNumber}/${maxAttempts}). Попробуйте обработать дополнительные граничные случаи.\n\n${attemptsLeftText}`
        );
    }

    interviewState.currentTaskAttempts = attemptNumber;

    if (attemptsLeft) {
        showNotification(
            `Исправьте решение и отправьте повторно. Осталось ${attemptsLeft} ${formatAttemptsWord(attemptsLeft)}.`,
            'info'
        );
    } else {
        showNotification('Попытки исправления исчерпаны. Следующая отправка завершит задачу.', 'warning');
    }

    return attemptsLeft === 0;
}

async function submitSolution() {
    const code = interviewState.editor.getValue();
    logUserAction('submitSolution', { 
        codeLength: code.length,
        taskNumber: interviewState.metrics.tasksCount + 1
    });
    
    try {
        updateStage(2, 'completed');
        updateStage(3, 'active');
        updateProgress(40);
        showNotification('Анализ решения...', 'info');
        
        const testResponse = await fetch(`${API_BASE}/tests/run`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                code: code,
                task: interviewState.currentTask,
                language: 'python'
            })
        });

        const testResults = await testResponse.json();

        // Если видимые тесты прошли, но скрытые упали - анализируем ошибку
        const visibleCases = Array.isArray(testResults.visible) ? testResults.visible : [];
        const hiddenCases = Array.isArray(testResults.hidden) ? testResults.hidden : [];
        const visiblePassed = visibleCases.length ? visibleCases.every(t => t.passed) : false;
        const hiddenPassed = hiddenCases.length ? hiddenCases.every(t => t.passed) : false;

        if (visiblePassed && !hiddenPassed) {
            const attemptsExhausted = await handleHiddenTestFailure({
                code,
                hiddenCases
            });
            updateStage(3, 'active');
            if (!attemptsExhausted) {
                return;
            }
            showNotification('Попытки исправления исчерпаны. Переходим к финальной оценке.', 'warning');
        }

        const analysisResponse = await fetch(`${API_BASE}/solutions/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                code: code,
                task: interviewState.currentTask,
                testResults: testResults
            })
        });

        const analysis = await analysisResponse.json();
        
        logSystemEvent('solution-analyzed', {
            score: analysis.overallScore,
            technicalScore: analysis.technicalScore,
            communicationScore: analysis.communicationScore,
            taskNumber: interviewState.metrics.tasksCount + 1
        });

        // Сохранение в историю
        interviewState.taskHistory.push({
            task: interviewState.currentTask,
            code: code,
            analysis: analysis,
            testResults: testResults,
            score: analysis.overallScore,
            level: interviewState.currentLevel,
            metricsSnapshot: {
                timeSpentSeconds: interviewState.metrics.timeSpent,
                attempts: interviewState.currentTaskAttempts,
                hintsUsed: interviewState.metrics.hintsUsed
            },
            timestamp: Date.now()
        });

        interviewState.metrics.tasksCount++;
        recalculateInterviewMetrics('solution-submitted');
        updateMetrics();
        
        logStateChange('metrics', null, {
            tasksCount: interviewState.metrics.tasksCount,
            overallScore: interviewState.metrics.overallScore
        });

        updateStage(3, 'completed');
        updateProgress(60);
        showNotification('Решение проанализировано!', 'success');

        if (interviewState.metrics.tasksCount === 1) {
            // После первой задачи: показываем античит и задаем вопрос
            await showAntiCheatDemo();
            updateStage(4, 'active');
            await askFollowUpQuestion(analysis);
        } else {
            if (interviewState.metrics.tasksCount === 2) {
                // После второй задачи: задаем технический вопрос
                updateStage(4, 'active');
                await askTechnicalFollowUpQuestion(analysis);
            }
        }
    } catch (error) {
        console.error('Error submitting solution:', error);
        addChatMessage('assistant', 'Произошла ошибка при обработке решения. Попробуйте еще раз.');
    }
}

// Вопрос после первой задачи
async function askFollowUpQuestion(analysis) {
    clearModelRetryOptions();
    try {
        showNotification('Генерация вопроса интервьюера...', 'info');
        updateStage(4, 'active');
        showTypingIndicator();
        
        const { result: data, duration: generationTime } = await withLLM(async () => {
            const response = await fetchWithTimeout(`${API_BASE}/chat/question`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    task: interviewState.currentTask,
                    solution: interviewState.editor.getValue(),
                    analysis: analysis
                })
            }, {}, 120000); // 120 секунд таймаут для LLM запросов
    
            return await response.json();
        });

        updateStage(4, 'completed', generationTime);
        
        let question = data.question || '';
        if (!question.trim()) {
            question = 'Какова временная сложность вашего решения и почему вы выбрали именно этот подход?';
        } else {
            const raw = question.replace(/\s+/g, ' ').trim();
            const parts = raw.split('?');
            const candidates = [];
            for (let i = 0; i < parts.length - 1; i++) {
                let segment = (parts[i] + '?').trim();
                const lastDot = segment.lastIndexOf('.');
                if (lastDot !== -1 && lastDot < segment.length - 1) {
                    segment = segment.slice(lastDot + 1).trim();
                }
                if (segment) {
                    candidates.push(segment);
                }
            }

            // Берем последнюю короткую русскоязычную фразу-вопрос;
            // если русской нет, лучше fallback на заготовленный русский технический вопрос,
            // чем показывать английский.
            const ruQuestion = [...candidates].reverse().find(
                s => /[А-Яа-яЁё]/.test(s) && s.endsWith('?') && s.length <= 250
            );
            question = ruQuestion || 'Какова временная сложность вашего решения и почему вы выбрали именно этот подход?';
        }
        
        addChatMessage('assistant', question, generationTime);
        setActiveQuestion(question, 'follow-up');
        showNotification('Вопрос задан! Ответьте в чате', 'info');
    } catch (error) {
        console.error('Error generating question:', error);
        hideTypingIndicator();
        showNotification(`Ошибка при генерации вопроса: ${error.message}`, 'error');
        addChatMessage('assistant', `Ошибка при генерации вопроса: ${error.message}. Попробуйте еще раз.`);
        showModelRetryOption('Ошибка при генерации вопроса. Обновить ответ модели?', () => askFollowUpQuestion(analysis));
    } finally {
        hideTypingIndicator();
    }
}

// Дополнительный технический вопрос (если ответ был недостаточен)
async function askAdditionalTechnicalQuestion(taskNumber, previousEvaluation) {
    clearModelRetryOptions();
    try {
        showNotification('Генерация дополнительного технического вопроса...', 'info');
        updateStage(4, 'active');
        showTypingIndicator();
        
        // Получаем предыдущий вопрос и ответ
        const previousQuestion = interviewState.chatHistory
            .filter(m => m.role === 'assistant')
            .slice(-1)[0]?.content || '';
        const previousAnswer = interviewState.chatHistory
            .filter(m => m.role === 'user')
            .slice(-1)[0]?.content || '';
        
        const analysis = interviewState.taskHistory[interviewState.taskHistory.length - 1]?.analysis || {};
        
        const { result: data, duration: generationTime } = await withLLM(async () => {
            const response = await fetchWithTimeout(`${API_BASE}/chat/additional-question`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    task: interviewState.currentTask,
                    solution: interviewState.editor.getValue(),
                    previousQuestion: previousQuestion,
                    previousAnswer: previousAnswer,
                    analysis: analysis,
                    questionNumber: taskNumber
                })
            }, {}, 120000); // 120 секунд таймаут для LLM запросов
    
            return await response.json();
        });

        updateStage(4, 'completed', generationTime);
        
        let question = data.question || '';
        if (!question.trim()) {
            question = taskNumber === 1 
                ? 'Как ваш алгоритм обрабатывает граничные случаи, например, пустой массив?'
                : 'Какие альтернативные структуры данных вы могли бы использовать для оптимизации этого решения?';
        } else {
            const raw = question.replace(/\s+/g, ' ').trim();
            const parts = raw.split('?');
            const candidates = [];
            for (let i = 0; i < parts.length - 1; i++) {
                let segment = (parts[i] + '?').trim();
                const lastDot = segment.lastIndexOf('.');
                if (lastDot !== -1 && lastDot < segment.length - 1) {
                    segment = segment.slice(lastDot + 1).trim();
                }
                if (segment) {
                    candidates.push(segment);
                }
            }

            const ruQuestion = [...candidates].reverse().find(
                s => /[А-Яа-яЁё]/.test(s) && s.endsWith('?') && s.length <= 300
            );
            question = ruQuestion || (taskNumber === 1 
                ? 'Как ваш алгоритм обрабатывает граничные случаи, например, пустой массив?'
                : 'Какие альтернативные структуры данных вы могли бы использовать для оптимизации этого решения?');
        }
        
        addChatMessage('assistant', question, generationTime);
        setActiveQuestion(question, `additional-${taskNumber}`);
        showNotification('Дополнительный технический вопрос задан! Ответьте в чате', 'info');
    } catch (error) {
        console.error('Error generating additional question:', error);
        hideTypingIndicator();
        showNotification(`Ошибка при генерации дополнительного вопроса: ${error.message}`, 'error');
        addChatMessage('assistant', `Ошибка при генерации дополнительного вопроса: ${error.message}. Попробуйте еще раз.`);
        showModelRetryOption('Ошибка при генерации дополнительного вопроса. Обновить ответ модели?', () => askAdditionalTechnicalQuestion(taskNumber, previousEvaluation));
    } finally {
        hideTypingIndicator();
    }
}

// Обработка ответа на дополнительный вопрос
// Обработка ответа на дополнительный технический вопрос
async function handleAdditionalAnswer(answer, taskNumber) {
    try {
        // Отслеживание античита при ответе
        reportAntiCheatEvent('answer-submitted', { taskNumber: taskNumber, questionType: 'additional-technical' });
        
        showNotification('Оценка вашего ответа на дополнительный вопрос...', 'info');
        updateStage(3, 'active');
        showTypingIndicator();

        const evaluationPayload = {
            question: interviewState.chatHistory[interviewState.chatHistory.length - 2]?.content || '',
            answer: answer,
            solution: interviewState.editor.getValue(),
            context: buildEvaluationContext('additional-technical')
        };

        const { result: evaluation, duration: evaluationTime } = await withLLM(async () => {
            const evalResponse = await fetchWithTimeout(`${API_BASE}/chat/evaluate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(evaluationPayload)
            }, {}, 120000); // 120 секунд таймаут для LLM запросов

            return await evalResponse.json();
        });

        console.log('Additional answer evaluation result:', evaluation);
        updateStage(3, 'completed', evaluationTime);
        recordEvaluationResult(`additional-${taskNumber}`, evaluation);

        if (evaluation.feedback) {
            addChatMessage('assistant', evaluation.feedback, evaluationTime);
        }

        maybeSendAnswerQualityTip(evaluation);

        const isSufficient = isAnswerSufficient(evaluation);

        // Проверяем, нужно ли задать еще один дополнительный вопрос
        if (!isSufficient && interviewState.additionalQuestionsCount < interviewState.maxAdditionalQuestions) {
            // Еще можно задать дополнительный вопрос
            interviewState.additionalQuestionsCount++;
            await askAdditionalTechnicalQuestion(taskNumber, evaluation);
        } else if (taskNumber === 1) {
            // Для первой задачи - резюмируем и переходим ко второй задаче
            await summarizeAndGenerateNextTask(evaluation);
        } else {
            // Для второй задачи - показываем античит и финальный диалог
            await showAntiCheatDemo();
            await startFinalDialogue();
        }
    } catch (error) {
        console.error('Error handling additional answer:', error);
        hideTypingIndicator();
        showNotification(`Ошибка при обработке ответа: ${error.message}`, 'error');
        addChatMessage('assistant', `Произошла ошибка: ${error.message}. Попробуйте еще раз.`);
    } finally {
        hideTypingIndicator();
    }
}

// Технический вопрос после второй задачи
async function askTechnicalFollowUpQuestion(analysis) {
    clearModelRetryOptions();
    try {
        showNotification('Генерация технического вопроса...', 'info');
        updateStage(4, 'active');
        showTypingIndicator();
        
        const { result: data, duration: generationTime } = await withLLM(async () => {
            const response = await fetchWithTimeout(`${API_BASE}/chat/technical-question`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    task: interviewState.currentTask,
                    solution: interviewState.editor.getValue(),
                    testResults: { 
                        allPassed: true,
                        visible: interviewState.taskHistory[interviewState.taskHistory.length - 1]?.testResults?.visible || [],
                        hidden: interviewState.taskHistory[interviewState.taskHistory.length - 1]?.testResults?.hidden || []
                    },
                    analysis: analysis
                })
            });
    
            if (!response.ok) {
                throw new Error('Failed to generate technical question');
            }
    
            return await response.json();
        });

        updateStage(4, 'completed', generationTime);
        
        let question = data.question || '';
        if (!question.trim()) {
            question = 'Какова временная и пространственная сложность вашего решения?';
        } else {
            const raw = question.replace(/\s+/g, ' ').trim();
            const parts = raw.split('?');
            const candidates = [];
            for (let i = 0; i < parts.length - 1; i++) {
                let segment = (parts[i] + '?').trim();
                const lastDot = segment.lastIndexOf('.');
                if (lastDot !== -1 && lastDot < segment.length - 1) {
                    segment = segment.slice(lastDot + 1).trim();
                }
                if (segment) {
                    candidates.push(segment);
                }
            }

            // Берем последнюю короткую русскоязычную фразу-вопрос;
            const ruQuestion = [...candidates].reverse().find(
                s => /[А-Яа-яЁё]/.test(s) && s.endsWith('?') && s.length <= 300
            );
            question = ruQuestion || 'Какова временная и пространственная сложность вашего решения?';
        }
        
        addChatMessage('assistant', question, generationTime);
        setActiveQuestion(question, 'technical');
        showNotification('Технический вопрос задан! Ответьте в чате', 'info');
    } catch (error) {
        console.error('Error generating technical question:', error);
        showNotification('Ошибка при генерации технического вопроса', 'error');
        showModelRetryOption('Ошибка при генерации технического вопроса. Обновить ответ модели?', () => askTechnicalFollowUpQuestion(analysis));
    } finally {
        hideTypingIndicator();
    }
}

// Обработка ответа кандидата
async function handleCandidateAnswer(answer) {
    try {
        // Отслеживание античита при ответе
        reportAntiCheatEvent('answer-submitted', { taskNumber: 1, questionType: 'follow-up' });
        
        showNotification('Оценка вашего ответа...', 'info');
        updateStage(3, 'active');
        showTypingIndicator();

        const evaluationPayload = {
            question: interviewState.chatHistory[interviewState.chatHistory.length - 2]?.content || '',
            answer: answer,
            solution: interviewState.editor.getValue(),
            context: buildEvaluationContext('follow-up')
        };

        const { result: evaluation, duration: evaluationTime } = await withLLM(async () => {
            const evalResponse = await fetchWithTimeout(`${API_BASE}/chat/evaluate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(evaluationPayload)
            }, {}, 120000); // 120 секунд таймаут для LLM запросов

            return await evalResponse.json();
        });

        console.log('Evaluation result:', evaluation);
        updateStage(3, 'completed', evaluationTime);
        recordEvaluationResult('follow-up', evaluation);

        if (evaluation.feedback) {
            addChatMessage('assistant', evaluation.feedback, evaluationTime);
        }

        maybeSendAnswerQualityTip(evaluation);

        // Проверяем, достаточен ли ответ для определения уровня
        const isSufficient = isAnswerSufficient(evaluation);

        // Проверяем, нужно ли задать дополнительный вопрос (максимум 3)
        if (!isSufficient && interviewState.additionalQuestionsCount < interviewState.maxAdditionalQuestions) {
            // Ответ недостаточен и еще можно задать вопрос
            console.log(`Ответ недостаточен, задаем дополнительный вопрос (${interviewState.additionalQuestionsCount + 1}/${interviewState.maxAdditionalQuestions})`);
            interviewState.additionalQuestionsCount++;
            updateStage(4, 'active');
            await askAdditionalTechnicalQuestion(1, evaluation);
        } else {
            // Ответ достаточен или достигнут лимит вопросов - резюмируем и переходим к следующей задаче
            await summarizeAndGenerateNextTask(evaluation);
        }
    } catch (error) {
        console.error('Error handling answer:', error);
        hideTypingIndicator();
        showNotification(`Ошибка при обработке ответа: ${error.message}`, 'error');
        addChatMessage('assistant', `Произошла ошибка: ${error.message}. Попробуйте еще раз.`);
    } finally {
        hideTypingIndicator();
    }
}

// Обработка ответа на технический вопрос после второй задачи
async function handleTechnicalAnswer(answer) {
    try {
        // Отслеживание античита при ответе
        reportAntiCheatEvent('answer-submitted', { taskNumber: 2, questionType: 'technical' });
        
        showNotification('Оценка вашего технического ответа...', 'info');
        updateStage(3, 'active');
        showTypingIndicator();

        const evaluationPayload = {
            question: interviewState.chatHistory[interviewState.chatHistory.length - 2]?.content || '',
            answer: answer,
            solution: interviewState.editor.getValue(),
            context: buildEvaluationContext('technical')
        };

        const { result: evaluation, duration: evaluationTime } = await withLLM(async () => {
            const evalResponse = await fetchWithTimeout(`${API_BASE}/chat/evaluate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(evaluationPayload)
            }, {}, 120000); // 120 секунд таймаут для LLM запросов

            return await evalResponse.json();
        });

        console.log('Technical evaluation result:', evaluation);
        updateStage(3, 'completed', evaluationTime);
        recordEvaluationResult('technical', evaluation);

        if (evaluation.feedback) {
            addChatMessage('assistant', evaluation.feedback, evaluationTime);
        }

        maybeSendAnswerQualityTip(evaluation);

        // Проверяем, достаточен ли ответ для определения уровня
        const isSufficient = isAnswerSufficient(evaluation);

        // Проверяем, нужно ли задать дополнительный вопрос (максимум 3)
        if (!isSufficient && interviewState.additionalQuestionsCount < interviewState.maxAdditionalQuestions) {
            // Ответ недостаточен и еще можно задать вопрос
            console.log(`Ответ на технический вопрос недостаточен, задаем дополнительный вопрос (${interviewState.additionalQuestionsCount + 1}/${interviewState.maxAdditionalQuestions})`);
            interviewState.additionalQuestionsCount++;
            updateStage(4, 'active');
            await askAdditionalTechnicalQuestion(2, evaluation);
        } else {
            // Ответ достаточен или достигнут лимит вопросов - задаем третий завершающий вопрос
            updateStage(4, 'active');
            await askThirdQuestion(interviewState.taskHistory[interviewState.taskHistory.length - 1]?.analysis || evaluation);
        }
    } catch (error) {
        console.error('Error handling technical answer:', error);
        hideTypingIndicator();
        showNotification(`Ошибка при обработке ответа: ${error.message}`, 'error');
        addChatMessage('assistant', `Произошла ошибка: ${error.message}. Попробуйте еще раз.`);
    } finally {
        hideTypingIndicator();
    }
}

// Третий завершающий вопрос после второй задачи
async function askThirdQuestion(analysis) {
    clearModelRetryOptions();
    try {
        showNotification('Генерация завершающего вопроса...', 'info');
        updateStage(4, 'active');
        showTypingIndicator();
        
        // Получаем предыдущий ответ кандидата
        const previousAnswer = interviewState.chatHistory
            .filter(m => m.role === 'user')
            .pop()?.content || '';
        
        const { result: data, duration: generationTime } = await withLLM(async () => {
            const response = await fetchWithTimeout(`${API_BASE}/chat/third-question`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    task: interviewState.currentTask,
                    solution: interviewState.editor.getValue(),
                    previousAnswer: previousAnswer,
                    analysis: analysis
                })
            });
    
            if (!response.ok) {
                throw new Error('Failed to generate third question');
            }
    
            return await response.json();
        });

        updateStage(4, 'completed', generationTime);
        
        let question = data.question || '';
        if (!question.trim()) {
            question = 'Как бы вы улучшили это решение для работы с большими объемами данных?';
        } else {
            const raw = question.replace(/\s+/g, ' ').trim();
            const parts = raw.split('?');
            const candidates = [];
            for (let i = 0; i < parts.length - 1; i++) {
                let segment = (parts[i] + '?').trim();
                const lastDot = segment.lastIndexOf('.');
                if (lastDot !== -1 && lastDot < segment.length - 1) {
                    segment = segment.slice(lastDot + 1).trim();
                }
                if (segment) {
                    candidates.push(segment);
                }
            }

            // Берем последнюю короткую русскоязычную фразу-вопрос;
            const ruQuestion = [...candidates].reverse().find(
                s => /[А-Яа-яЁё]/.test(s) && s.endsWith('?') && s.length <= 300
            );
            question = ruQuestion || 'Как бы вы улучшили это решение для работы с большими объемами данных?';
        }
        
        addChatMessage('assistant', question, generationTime);
        setActiveQuestion(question, 'third');
        showNotification('Завершающий вопрос задан! Ответьте в чате', 'info');
    } catch (error) {
        console.error('Error generating third question:', error);
        showNotification('Ошибка при генерации завершающего вопроса', 'error');
        showModelRetryOption('Ошибка при генерации завершающего вопроса. Обновить ответ модели?', () => askThirdQuestion(analysis));
    } finally {
        hideTypingIndicator();
    }
}

// Обработка ответа на третий завершающий вопрос
async function handleThirdAnswer(answer) {
    try {
        // Отслеживание античита при ответе
        reportAntiCheatEvent('answer-submitted', { taskNumber: 2, questionType: 'final' });
        
        showNotification('Оценка вашего завершающего ответа...', 'info');
        updateStage(3, 'active');
        showTypingIndicator();

        const evaluationPayload = {
            question: interviewState.chatHistory[interviewState.chatHistory.length - 2]?.content || '',
            answer: answer,
            solution: interviewState.editor.getValue(),
            context: buildEvaluationContext('final')
        };

        const { result: evaluation, duration: evaluationTime } = await withLLM(async () => {
            const evalResponse = await fetchWithTimeout(`${API_BASE}/chat/evaluate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(evaluationPayload)
            }, {}, 120000); // 120 секунд таймаут для LLM запросов

            return await evalResponse.json();
        });

        console.log('Third question evaluation result:', evaluation);
        updateStage(3, 'completed', evaluationTime);
        recordEvaluationResult('final', evaluation);

        if (evaluation.feedback) {
            addChatMessage('assistant', evaluation.feedback, evaluationTime);
        }

        maybeSendAnswerQualityTip(evaluation);

        // Проверяем, достаточен ли ответ для определения уровня
        const isSufficient = isAnswerSufficient(evaluation);

        // Проверяем, нужно ли задать дополнительный вопрос (максимум 3)
        if (!isSufficient && interviewState.additionalQuestionsCount < interviewState.maxAdditionalQuestions) {
            // Ответ недостаточен и еще можно задать вопрос
            console.log(`Ответ на третий вопрос недостаточен, задаем дополнительный вопрос (${interviewState.additionalQuestionsCount + 1}/${interviewState.maxAdditionalQuestions})`);
            interviewState.additionalQuestionsCount++;
            updateStage(4, 'active');
            await askAdditionalTechnicalQuestion(2, evaluation);
        } else {
            // Ответ достаточен или достигнут лимит вопросов - показываем античит и финальный диалог
            await showAntiCheatDemo();
            await startFinalDialogue();
        }
    } catch (error) {
        console.error('Error handling third answer:', error);
        hideTypingIndicator();
        showNotification(`Ошибка при обработке ответа: ${error.message}`, 'error');
        addChatMessage('assistant', `Произошла ошибка: ${error.message}. Попробуйте еще раз.`);
    } finally {
        hideTypingIndicator();
    }
}

// Резюмирование разговора и генерация следующей задачи
async function summarizeAndGenerateNextTask(evaluation) {
    try {
        showNotification('Резюмирование разговора по первой задаче...', 'info');
        addChatMessage('assistant', 'Резюмирую наш разговор по первой задаче для генерации второй задачи...');
        
        // Получаем историю разговора по первой задаче (все вопросы и ответы)
        const taskChatHistory = interviewState.chatHistory.filter(msg => 
            msg.role === 'assistant' || msg.role === 'user'
        );
        
        const analysis = interviewState.taskHistory[interviewState.taskHistory.length - 1]?.analysis || {};
        
        // Резюмируем разговор
        const { result: summaryData, duration: summaryTime } = await withLLM(async () => {
            const summaryResponse = await fetchWithTimeout(`${API_BASE}/chat/summarize`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    task: interviewState.currentTask,
                    solution: interviewState.editor.getValue(),
                    analysis: analysis,
                    chatHistory: taskChatHistory
                })
            });
            
            if (!summaryResponse.ok) {
                throw new Error(`HTTP error! status: ${summaryResponse.status}`);
            }
            
            return await summaryResponse.json();
        });
        
        console.log('Conversation summary:', summaryData.summary);
        console.log('Summary length:', taskChatHistory.length, 'messages');
        
        // Определяем уровень для следующей задачи
        const nextLevel = determineNextLevel(evaluation);
        console.log('Next level determined:', nextLevel, 'based on evaluation:', evaluation);
        
        // Генерируем следующую задачу с учетом резюме
        await generateNextTask(evaluation, nextLevel, summaryData.summary);
    } catch (error) {
        console.error('Error summarizing conversation:', error);
        // В случае ошибки резюмирования просто генерируем задачу без резюме
        const nextLevel = determineNextLevel(evaluation);
        await generateNextTask(evaluation, nextLevel);
    }
}

// Генерация следующей задачи
async function generateNextTask(evaluation, nextLevel = null, conversationSummary = null) {
    updateStage(4, 'completed');
    updateStage(5, 'active');
    updateProgress(70);
    showNotification('Генерация второй задачи...', 'info');
    clearModelRetryOptions();
    
    // Определяем уровень, если не передан
    if (!nextLevel) {
        nextLevel = determineNextLevel(evaluation);
    }
    const retryLevel = nextLevel;
    const retryConversationSummary = conversationSummary;
    
    // Сбрасываем счетчик дополнительных вопросов для новой задачи
    interviewState.additionalQuestionsCount = 0;
    
    console.log('Generating next task with level:', nextLevel);
    if (conversationSummary) {
        console.log('Using conversation summary for task generation');
    }
    
    addChatMessage('assistant', `Отлично! На основе вашего ответа я подобрал задачу уровня ${nextLevel}. Генерирую задачу...`);

    // Streaming генерация с улучшенной визуализацией
    const taskContainer = document.getElementById('task-view');
    taskContainer.innerHTML = `
        <div class="loading" style="padding: 30px; text-align: center;">
            <div style="margin-bottom: 20px;">
                <div style="display: inline-block; width: 40px; height: 40px; border: 4px solid rgba(78, 201, 176, 0.3); border-top-color: #4ec9b0; border-radius: 50%; animation: spin 1s linear infinite;"></div>
            </div>
            <div style="color: #4ec9b0; font-size: 18px; font-weight: 500; margin-bottom: 15px;">
                Генерация задачи уровня ${nextLevel}...
            </div>
            <div class="streaming-text" style="color: #858585; font-size: 14px; line-height: 1.6; text-align: left; max-width: 600px; margin: 0 auto; min-height: 100px; padding: 20px; background: rgba(78, 201, 176, 0.05); border-radius: 6px; border-left: 3px solid #4ec9b0;">
                <span style="display: inline-block; width: 2px; height: 16px; background: #4ec9b0; animation: blink 1s infinite; vertical-align: middle; margin-left: 2px;"></span>
            </div>
        </div>
        <style>
            @keyframes spin {
                to { transform: rotate(360deg); }
            }
            @keyframes blink {
                0%, 50% { opacity: 1; }
                51%, 100% { opacity: 0; }
            }
        </style>
    `;

    try {
        const { result: task, duration: generationTime } = await withLLM(async () => {
            const response = await fetch(`${API_BASE}/tasks/generate-stream`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    level: nextLevel,
                    topic: 'algorithms',
                    language: 'python',
                    previousTask: interviewState.currentTask,
                    candidatePerformance: {
                        level: interviewState.currentLevel,
                        score: evaluation.score || evaluation.overallScore || 0,
                        understanding: evaluation.understanding || 0,
                        communication: evaluation.communication || 0,
                        timeSpent: interviewState.metrics.timeSpent,
                        attempts: 1,
                        trend: evaluation.score >= 85 ? 'improving' : (evaluation.score >= 70 ? 'stable' : 'declining')
                    },
                    conversationSummary: conversationSummary || null
                })
            });

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let fullContent = '';
            let lastUpdateTime = Date.now();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            if (data.chunk) {
                                fullContent = data.accumulated || fullContent + data.chunk;
                                
                                // Обновляем UI с анимацией печатания
                                const now = Date.now();
                                if (now - lastUpdateTime > 50) { // Обновляем не чаще чем раз в 50мс
                                    const streamingEl = taskContainer.querySelector('.streaming-text');
                                    if (streamingEl) {
                                        // Форматируем текст с сохранением структуры
                                        const formattedContent = escapeHtml(fullContent)
                                            .replace(/\n/g, '<br>')
                                            .replace(/\*\*(.*?)\*\*/g, '<strong style="color: #4ec9b0;">$1</strong>')
                                            .replace(/\*(.*?)\*/g, '<em>$1</em>');
                                        
                                        streamingEl.innerHTML = formattedContent + 
                                            '<span style="display: inline-block; width: 2px; height: 16px; background: #4ec9b0; animation: blink 1s infinite; vertical-align: middle; margin-left: 2px;"></span>';
                                    }
                                    lastUpdateTime = now;
                                }
                            }
                            if (data.done && data.task) {
                                // Убираем курсор при завершении
                                const streamingEl = taskContainer.querySelector('.streaming-text');
                                if (streamingEl) {
                                    streamingEl.innerHTML = escapeHtml(fullContent).replace(/\n/g, '<br>');
                                }
                                return data.task;
                            }
                        } catch (e) {
                            // Игнорируем ошибки парсинга
                        }
                    }
                }
            }

            // Fallback: обычная генерация
            const taskResponse = await fetch(`${API_BASE}/tasks/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    level: nextLevel,
                    topic: 'algorithms',
                    language: 'python'
                })
            });
            return await taskResponse.json();
        });

        interviewState.currentTask = task;
        interviewState.currentTaskAttempts = 0;
        ensureHintStateForTask(task);
        setActiveQuestion(null);
        displayTask(task);
        updateStage(5, 'completed', generationTime);
        updateProgress(80);
        showNotification(`Задача уровня ${nextLevel} сгенерирована!`, 'success');
        addChatMessage('assistant', `Задача уровня ${nextLevel} сгенерирована! Приступайте к решению.`, generationTime);
        
        // Сохраняем задачу в историю
        interviewState.taskHistory.push({
            task: task,
            level: nextLevel,
            timestamp: Date.now()
        });
        
        // После генерации второй задачи ждем, пока кандидат решит её
        // Вопрос будет задан после отправки решения (в submitSolution)
    } catch (error) {
        console.error('Error in streaming:', error);
        showNotification('Ошибка при генерации задачи', 'error');
        addChatMessage('assistant', 'Ошибка при генерации задачи. Попробуйте еще раз.');
        showModelRetryOption(
            'Ошибка при генерации следующей задачи. Обновить ответ модели?',
            () => generateNextTask(evaluation, retryLevel, retryConversationSummary)
        );
    }
}

// Определение следующего уровня с учетом стартового выбора кандидата
function determineNextLevel(evaluation) {
    // Оценки из LLM
    const score = evaluation.score ?? evaluation.overallScore ?? 0;
    const understanding = evaluation.understanding ?? 0;
    const communication = evaluation.communication ?? 0;

    // Взвешенная комбинированная оценка: больше веса технике
    const combinedScore = Math.round(
        score * 0.6 +
        understanding * 0.25 +
        communication * 0.15
    );

    const levelOrder = ['Junior-', 'Junior', 'Junior+', 'Middle', 'Middle+', 'Senior'];

    // Уровень, выбранный кандидатом на старте, используется как нижняя граница
    const baseLevel = interviewState.currentLevel || 'Junior';
    let baseIndex = levelOrder.indexOf(baseLevel);
    if (baseIndex === -1) {
        baseIndex = levelOrder.indexOf('Junior');
    }

    let targetIndex = baseIndex;

    // При высоких оценках уровень растет, но никогда не падает ниже стартового
    if (combinedScore >= 85) {
        // Сильный результат — можно поднять на 2 шага, но не выше максимума
        targetIndex = Math.min(baseIndex + 2, levelOrder.length - 1);
    } else if (combinedScore >= 70) {
        // Нормальный/уверенный результат — поднимаем на 1 шаг
        targetIndex = Math.min(baseIndex + 1, levelOrder.length - 1);
    } else {
        // Низкий результат — уровень не понижаем, оставляем как есть
        targetIndex = baseIndex;
    }

    const nextLevel = levelOrder[targetIndex];
    console.log('Determining level:', {
        score,
        understanding,
        communication,
        combinedScore,
        baseLevel,
        nextLevel
    });

    return nextLevel;
}

// Демонстрация античита
async function showAntiCheatDemo() {
    if (!interviewState?.antiCheatEnabled) {
        console.log('Anti-cheat disabled — skipping demo output');
        return;
    }

    addChatMessage('assistant', '🔒 Демонстрация системы защиты от читерства:');
    
    // Получаем события текущей сессии; если их нет, используем последние системные
    const sessionAntiCheatEvents = interviewState?.antiCheatEvents || [];
    const antiCheatEvents = sessionAntiCheatEvents.length
        ? sessionAntiCheatEvents
        : (adminState?.antiCheatEvents || []);
    const hasRealEvents = antiCheatEvents.length > 0;
    const eventTypes = {};

    if (hasRealEvents) {
        addChatMessage('system', '📊 Обнаруженные события во время собеседования:');
        
        // Группируем события по типам
        antiCheatEvents.forEach(event => {
            const type = event.type || 'unknown';
            eventTypes[type] = (eventTypes[type] || 0) + 1;
        });
        
        for (const [type, count] of Object.entries(eventTypes)) {
            await new Promise(resolve => setTimeout(resolve, 800));
            const typeNames = {
                'clipboard-copy': 'Копирование из буфера обмена',
                'clipboard-paste': 'Вставка из буфера обмена',
                'window-blur': 'Переключение вкладок/окон',
                'tab-hidden': 'Скрытие вкладки',
                'devtools': 'Открытие DevTools',
                'keydown': 'Подозрительная активность клавиатуры',
                'inactivity': 'Период бездействия',
                // Совместимость со старыми ключами
                'copy': 'Копирование из буфера обмена',
                'paste': 'Вставка из буфера обмена',
                'blur': 'Переключение вкладок/окон',
                'visibilitychange': 'Изменение видимости страницы'
            };
            const typeName = typeNames[type] || type;
            addChatMessage('system', `⚠️ ${typeName}: ${count} ${count === 1 ? 'событие' : 'событий'}`);
        }
    }
    
    // Демонстрационные сообщения
    const demoMessages = [
        { type: 'copy', message: '📋 Обнаружено копирование кода из буфера обмена', icon: '📋' },
        { type: 'paste', message: '📥 Обнаружена вставка кода из буфера обмена', icon: '📥' },
        { type: 'devtools', message: '🔧 Обнаружено открытие DevTools', icon: '🔧' },
        { type: 'blur', message: '🔄 Обнаружено переключение вкладок/окон', icon: '🔄' },
        { type: 'visibilitychange', message: '👁️ Обнаружено изменение видимости страницы', icon: '👁️' },
        { type: 'inactivity', message: '⏸️ Обнаружен период бездействия', icon: '⏸️' },
        { type: 'keydown', message: '⌨️ Обнаружены множественные вставки кода', icon: '⌨️' }
    ];

    // Показываем только те типы, которые не были показаны из реальных событий
    const shownTypes = hasRealEvents ? Object.keys(eventTypes) : [];
    const messagesToShow = demoMessages.filter(msg => !shownTypes.includes(msg.type));
    
    if (messagesToShow.length > 0) {
        addChatMessage('system', '📋 Дополнительные возможности системы защиты:');
    }

    for (const msg of messagesToShow.slice(0, 4)) { // Показываем максимум 4 дополнительных сообщения
        await new Promise(resolve => setTimeout(resolve, 1000));
        addChatMessage('system', `${msg.icon} ${msg.message}`);
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
    
    addChatMessage('assistant', '✅ Система защиты отслеживает различные подозрительные действия для обеспечения честности интервью. Все события логируются и анализируются.');
    
    if (hasRealEvents) {
        addChatMessage('system', `📈 Всего зафиксировано событий: ${antiCheatEvents.length}`);
    }
}

// Финальный диалог
async function startFinalDialogue() {
    clearModelRetryOptions();
    try {
        showTypingIndicator();
        const { result: data, duration: generationTime } = await withLLM(async () => {
            const response = await fetchWithTimeout(`${API_BASE}/chat/final-question`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    taskHistory: interviewState.taskHistory,
                    currentTask: interviewState.currentTask,
                    metrics: interviewState.metrics
                })
            });
    
            if (!response.ok) {
                throw new Error('Failed to generate final question');
            }
    
            return await response.json();
        });
        
        let question = data.question || '';
        if (!question.trim()) {
            question = 'Есть ли что-то, что вы хотели бы добавить перед завершением интервью?';
        } else {
            const raw = question.replace(/\s+/g, ' ').trim();
            const parts = raw.split('?');
            const candidates = [];
            for (let i = 0; i < parts.length - 1; i++) {
                let segment = (parts[i] + '?').trim();
                const lastDot = segment.lastIndexOf('.');
                if (lastDot !== -1 && lastDot < segment.length - 1) {
                    segment = segment.slice(lastDot + 1).trim();
                }
                if (segment) {
                    candidates.push(segment);
                }
            }

            const ruQuestion = [...candidates].reverse().find(
                s => /[А-Яа-яЁё]/.test(s) && s.endsWith('?') && s.length <= 250
            );
            question = ruQuestion || 'Есть ли что-то, что вы хотели бы добавить перед завершением интервью?';
        }
        
        addChatMessage('assistant', question, generationTime);
        setActiveQuestion(question, 'final');
    } catch (error) {
        console.error('Error generating final question:', error);
        showModelRetryOption('Ошибка при генерации финального вопроса. Обновить ответ модели?', () => startFinalDialogue());
    } finally {
        hideTypingIndicator();
    }
}

// Флаг для предотвращения дублирования
let isProcessingMessage = false;

// Отправка сообщения в чат
async function sendMessage() {
    // Предотвращаем дублирование
    if (isProcessingMessage) {
        return;
    }
    
    const input = document.getElementById('chat-input');
    const message = input.value.trim();
    
    if (!message) return;

    logUserAction('sendMessage', { 
        messageLength: message.length,
        tasksCount: interviewState.metrics.tasksCount,
        chatHistoryLength: interviewState.chatHistory.length
    });

    isProcessingMessage = true;
    addChatMessage('user', message);
    setActiveQuestion(null);
    input.value = '';
    input.disabled = true; // Блокируем ввод во время обработки

    try {
        // Обработка ответа
        // Проверяем, что это ответ на вопрос после первой или второй задачи
        const lastAssistantMessage = interviewState.chatHistory.filter(m => m.role === 'assistant').pop();
        const isAnswerToFirstQuestion = interviewState.metrics.tasksCount === 1 && 
                                         interviewState.chatHistory.length >= 2 &&
                                         lastAssistantMessage && 
                                         lastAssistantMessage.content.includes('?');
        
        // Для второй задачи: находим индекс сообщения о генерации второй задачи
        // и считаем вопросы после него
        let questionsAfterSecondTask = 0;
        if (interviewState.metrics.tasksCount === 2) {
            const secondTaskMessageIndex = interviewState.chatHistory.findIndex(m => 
                m.role === 'assistant' && 
                (m.content.includes('Задача уровня') && m.content.includes('сгенерирована'))
            );
            
            if (secondTaskMessageIndex >= 0) {
                // Считаем вопросы после сообщения о генерации второй задачи
                questionsAfterSecondTask = interviewState.chatHistory
                    .slice(secondTaskMessageIndex + 1)
                    .filter(m => m.role === 'assistant' && m.content.includes('?')).length;
            } else {
                // Fallback: считаем все вопросы после первой задачи
                const firstTaskEndIndex = interviewState.chatHistory.findIndex(m => 
                    m.role === 'assistant' && m.content.includes('Генерирую задачу')
                );
                if (firstTaskEndIndex >= 0) {
                    questionsAfterSecondTask = interviewState.chatHistory
                        .slice(firstTaskEndIndex + 1)
                        .filter(m => m.role === 'assistant' && m.content.includes('?')).length;
                }
            }
        }
        
        // Проверяем, является ли это ответом на дополнительный вопрос
        // Дополнительный вопрос задается после того, как был задан основной вопрос и ответ был недостаточен
        const allQuestions = interviewState.chatHistory.filter(m => m.role === 'assistant' && m.content.includes('?'));
        const isAnswerToAdditionalQuestion = lastAssistantMessage && 
                                              lastAssistantMessage.content.includes('?') &&
                                              (lastAssistantMessage.content.toLowerCase().includes('дополнительный') || 
                                               (interviewState.metrics.tasksCount === 1 && allQuestions.length > 1) ||
                                               (interviewState.metrics.tasksCount === 2 && questionsAfterSecondTask > 2));
        
        const isAnswerToTechnicalQuestion = interviewState.metrics.tasksCount === 2 && 
                                             interviewState.chatHistory.length >= 2 &&
                                             lastAssistantMessage && 
                                             lastAssistantMessage.content.includes('?') &&
                                             questionsAfterSecondTask === 1 && 
                                             !isAnswerToAdditionalQuestion; // Первый вопрос после второй задачи
        const isAnswerToThirdQuestion = interviewState.metrics.tasksCount === 2 && 
                                         interviewState.chatHistory.length >= 2 &&
                                         lastAssistantMessage && 
                                         lastAssistantMessage.content.includes('?') &&
                                         questionsAfterSecondTask === 2 &&
                                         !isAnswerToAdditionalQuestion; // Второй вопрос после второй задачи
        
        if (isAnswerToFirstQuestion) {
            // Ответ на вопрос после первой задачи
            await handleCandidateAnswer(message);
        } else if (isAnswerToAdditionalQuestion && interviewState.metrics.tasksCount === 1) {
            // Ответ на дополнительный вопрос после первой задачи
            await handleAdditionalAnswer(message, 1);
        } else if (isAnswerToTechnicalQuestion) {
            // Ответ на технический вопрос после второй задачи
            await handleTechnicalAnswer(message);
        } else if (isAnswerToAdditionalQuestion && interviewState.metrics.tasksCount === 2) {
            // Ответ на дополнительный вопрос после второй задачи
            await handleAdditionalAnswer(message, 2);
        } else if (isAnswerToThirdQuestion) {
            // Ответ на третий завершающий вопрос после второй задачи
            await handleThirdAnswer(message);
        } else if (interviewState.metrics.tasksCount === 2) {
            // Финальный диалог
            try {
                pauseTimer(); // Останавливаем секундомер
                showTypingIndicator();
                const generationStart = Date.now();
                
                const response = await fetchWithTimeout(`${API_BASE}/chat/dialogue`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        question: interviewState.chatHistory[interviewState.chatHistory.length - 2].content,
                        answer: message,
                        context: {
                            tasks: interviewState.taskHistory,
                            metrics: interviewState.metrics
                        }
                    })
                }, {}, 120000); // 120 секунд таймаут для LLM запросов

                const data = await response.json();
                const generationTime = Date.now() - generationStart;
                resumeTimer(); // Возобновляем секундомер
                
                // Очищаем ответ от reasoning
                let responseText = data.response || '';
                responseText = responseText.replace(/<think>[\s\S]*?<\/redacted_reasoning>/gi, '');
                responseText = responseText.replace(/<\/redacted_reasoning>[\s\S]*?<think>/gi, '');
                
                // Берем только последнее предложение или вопрос
                const sentences = responseText.split(/[.!?]\s+/);
                if (sentences.length > 1 && sentences[sentences.length - 1].length > 20) {
                    responseText = sentences[sentences.length - 1].trim();
                    if (!/[.!?]$/.test(responseText)) {
                        responseText += '.';
                    }
                }
                
                addChatMessage('assistant', responseText || 'Не удалось получить ответ. Попробуйте еще раз.', generationTime);

                // После нескольких обменов показываем отчет
                if (interviewState.chatHistory.length >= 6) {
                    setTimeout(() => showFinalReport(), 2000);
                }
            } catch (error) {
                console.error('Error in dialogue:', error);
                hideTypingIndicator();
                resumeTimer(); // Возобновляем таймер в случае ошибки
                addChatMessage('assistant', `Ошибка: ${error.message}. Попробуйте еще раз.`);
            }
        }
    } catch (error) {
        console.error('Unexpected error in sendMessage:', error);
        hideTypingIndicator();
        resumeTimer();
        addChatMessage('assistant', `Произошла непредвиденная ошибка: ${error.message}. Попробуйте еще раз.`);
    } finally {
        isProcessingMessage = false;
        const inputEl = document.getElementById('chat-input');
        if (inputEl) {
            inputEl.disabled = false; // Разблокируем ввод
            inputEl.focus(); // Возвращаем фокус
        }
        hideTypingIndicator(); // Гарантируем скрытие индикатора в любом случае
    }
}

// Обработка нажатия Enter в чате
function handleChatKeyPress(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault(); // Предотвращаем перенос строки
        if (!isProcessingMessage) {
            sendMessage();
        }
    }
}

// Все функции чата, метрик и таймера импортированы из соответствующих модулей:
// showTypingIndicator, hideTypingIndicator, addChatMessage, scrollChatToBottom, isChatAtBottom - из './js/modules/chat-manager.js'
// pauseTimer, resumeTimer, withLLM, updateMetrics, calculateAverageScore, startTimer, stopTimer - из './js/modules/metrics-manager.js'
// showFinalReport, displayReport, downloadReport - из './js/modules/report-manager.js'

// Смена языка
function changeLanguage() {
    const select = document.getElementById('language-select');
    const language = select.value;
    logUserAction('changeLanguage', { language });
    if (interviewState.editor) {
        monaco.editor.setModelLanguage(interviewState.editor.getModel(), language);
    }
}

// Все функции UI импортированы из './js/modules/ui-utils.js':
// updateStage, updateProgress, showNotification, showLoading, showError, escapeHtml, setStageDuration, formatDuration

// -------- Admin panel helpers --------
function renderAdminPanel() {
    renderTaskTable();
    hydrateInterviewForm();
    renderSessions();
    renderCandidateResults();
    renderCandidateMetricsReport();
    renderTransparencyProtocol();
    renderAntiCheatEvents();
    renderAdminAnalytics();
    
    const container = document.querySelector('.admin-panel-container');
    if (!container) return;
    
    const statusBadge = container.querySelector('.admin-sync-status');
    if (statusBadge) {
        statusBadge.textContent = adminState.loading ? 'Синхронизация...' : (adminState.lastSync ? `Обновлено: ${new Date(adminState.lastSync).toLocaleTimeString()}` : 'Еще не синхронизировано');
    }

    updateTaskFormUI(adminState.taskFormMode);
}

function updateTaskFormUI(mode = 'create') {
    const titleEl = document.getElementById('task-form-title');
    const submitBtn = document.getElementById('task-form-submit');
    const cancelBtn = document.getElementById('task-form-cancel');
    if (!titleEl || !submitBtn || !cancelBtn) {
        return;
    }

    if (mode === 'edit') {
        titleEl.textContent = 'Редактировать задачу';
        submitBtn.textContent = 'Сохранить изменения';
        cancelBtn.style.display = 'inline-flex';
    } else {
        titleEl.textContent = 'Новая задача';
        submitBtn.textContent = 'Сохранить задачу';
        cancelBtn.style.display = 'none';
    }
}

function cancelTaskEdit() {
    const form = document.getElementById('new-task-form');
    if (form) {
        form.reset();
        const hidden = form.querySelector('#task-id-field');
        if (hidden) hidden.value = '';
    }
    adminState.taskFormMode = 'create';
    adminState.editingTaskId = null;
    updateTaskFormUI('create');
}

function beginTaskEdit(taskId) {
    const task = adminState.tasks.find(t => t.id === taskId);
    const form = document.getElementById('new-task-form');
    if (!task || !form) {
        return;
    }

    form.querySelector('#task-id-field').value = task.id;
    form.elements.title.value = task.title || '';
    form.elements.description.value = task.description || '';
    form.elements.level.value = task.level || 'Junior';
    form.elements.topic.value = task.topic || 'algorithms';
    form.elements.tags.value = Array.isArray(task.tags) ? task.tags.join(', ') : (task.tags || '');
    if (form.elements.visibility) {
        form.elements.visibility.value = task.visibility || 'draft';
    }

    adminState.taskFormMode = 'edit';
    adminState.editingTaskId = task.id;
    updateTaskFormUI('edit');
}

function deleteTask(taskId) {
    if (!taskId) return;
    const confirmed = confirm('Удалить задачу из банка?');
    if (!confirmed) return;

    fetch(`${API_BASE}/admin/tasks/${taskId}`, { method: 'DELETE' })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Ошибка удаления задачи: ${response.status}`);
            }
            return response.json();
        })
        .then(() => {
            adminState.tasks = adminState.tasks.filter(task => task.id !== taskId);
            if (adminState.editingTaskId === taskId) {
                cancelTaskEdit();
            } else {
                renderTaskTable();
            }
            showNotification('Задача удалена из банка', 'info');
        })
        .catch(error => {
            console.error(error);
            showNotification('Не удалось удалить задачу', 'error');
        });
}

function renderTaskTable() {
    const tbody = document.getElementById('task-table-body');
    if (!tbody) return;

    const columnCount = 7;
    const { level, topic, search } = adminState.filters;
    const filtered = adminState.tasks.filter(task => {
        const matchesLevel = level === 'all' || task.level === level;
        const matchesTopic = topic === 'all' || task.topic === topic;
        const matchesSearch = !search || task.title.toLowerCase().includes(search.toLowerCase()) || task.id.toLowerCase().includes(search.toLowerCase());
        return matchesLevel && matchesTopic && matchesSearch;
    });

    if (adminState.loading) {
        tbody.innerHTML = `<tr><td colspan="${columnCount}">Загрузка...</td></tr>`;
        return;
    }

    const rows = filtered.map(task => {
        const visibility = task.visibility || 'draft';
        const statusClass = visibility === 'public' ? 'approved' : (visibility === 'private' ? 'rejected' : 'review');
        return `
        <tr>
            <td>${escapeHtml(task.id)}</td>
            <td>${escapeHtml(task.title)}</td>
            <td>${escapeHtml(task.level)}</td>
            <td>${escapeHtml(task.topic)}</td>
            <td>${escapeHtml(task.updated || '-')}</td>
            <td><span class="status-badge ${statusClass}">${escapeHtml(visibility)}</span></td>
            <td class="table-actions">
                <button type="button" class="btn ghost task-edit-btn" data-task-id="${task.id}">Редакт.</button>
                <button type="button" class="btn btn-danger task-delete-btn" data-task-id="${task.id}">Удалить</button>
            </td>
        </tr>
    `;
    }).join('');

    tbody.innerHTML = rows || `<tr><td colspan="${columnCount}">Задачи не найдены</td></tr>`;

    tbody.querySelectorAll('.task-edit-btn').forEach(btn => {
        btn.addEventListener('click', () => beginTaskEdit(btn.dataset.taskId));
    });
    tbody.querySelectorAll('.task-delete-btn').forEach(btn => {
        btn.addEventListener('click', () => deleteTask(btn.dataset.taskId));
    });
}

function handleTaskFilterChange() {
    const levelSelect = document.getElementById('task-level-filter');
    const topicSelect = document.getElementById('task-topic-filter');
    const searchInput = document.getElementById('task-search');

    if (levelSelect) adminState.filters.level = levelSelect.value;
    if (topicSelect) adminState.filters.topic = topicSelect.value;
    if (searchInput) adminState.filters.search = searchInput.value.trim();

    renderTaskTable();
}

function handleNewTask(event) {
    event.preventDefault();
    const form = event.target;
    const data = new FormData(form);
    const taskId = data.get('taskId');
    const payload = {
        title: data.get('title'),
        description: data.get('description'),
        level: data.get('level'),
        topic: data.get('topic'),
        tags: data.get('tags') || '',
        visibility: data.get('visibility') || 'draft'
    };

    const endpoint = taskId ? `${API_BASE}/admin/tasks/${taskId}` : `${API_BASE}/admin/tasks`;
    const method = taskId ? 'PUT' : 'POST';

    fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`Ошибка сохранения задачи: ${response.status}`);
        }
        return response.json();
    })
    .then(savedTask => {
        if (taskId) {
            const index = adminState.tasks.findIndex(task => task.id === savedTask.id);
            if (index !== -1) {
                adminState.tasks[index] = savedTask;
            }
        } else {
            adminState.tasks.unshift(savedTask);
        }
        cancelTaskEdit();
        renderTaskTable();
        showNotification(taskId ? 'Задача обновлена' : 'Задача добавлена в банк', 'success');
    })
    .catch(error => {
        console.error(error);
        showNotification('Не удалось сохранить задачу', 'error');
    });
}

function hydrateInterviewForm() {
    const form = document.getElementById('interview-settings-form');
    if (!form) return;

    const settings = adminState.settings || adminDefaults.settings;
    if (!settings) return;
    
    // Обновляем состояние античита из настроек
    setAntiCheatEnabled(settings?.antiCheat?.enabled);

    form.duration.value = settings.duration;
    form.maxTasks.value = settings.maxTasks;
    form.model.value = settings.model;
    form.temperature.value = settings.temperature;
    form.metricsTechnical.checked = !!settings.metrics?.technical;
    form.metricsCommunication.checked = !!settings.metrics?.communication;
    form.metricsReadability.checked = !!settings.metrics?.readability;
    form.antiCheatEnabled.checked = settings?.antiCheat?.enabled !== false;
    form.antiCheatClipboard.checked = !!settings.antiCheat?.clipboard;
    form.antiCheatDevtools.checked = !!settings.antiCheat?.devtools;
    form.antiCheatExtensions.checked = !!settings.antiCheat?.extensions;
}

function saveInterviewSettings(event) {
    event.preventDefault();
    const form = event.target;
    
    const payload = {
        duration: Number(form.duration.value),
        maxTasks: Number(form.maxTasks.value),
        model: form.model.value,
        temperature: Number(form.temperature.value),
        metrics: {
            technical: form.metricsTechnical.checked,
            communication: form.metricsCommunication.checked,
            readability: form.metricsReadability.checked
        },
        antiCheat: {
            enabled: form.antiCheatEnabled.checked,
            clipboard: form.antiCheatClipboard.checked,
            devtools: form.antiCheatDevtools.checked,
            extensions: form.antiCheatExtensions.checked
        }
    };

    fetch(`${API_BASE}/admin/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`Ошибка сохранения настроек: ${response.status}`);
        }
        return response.json();
    })
    .then(settings => {
        adminState.settings = settings;
        // Обновляем состояние античита из сохраненных настроек
        setAntiCheatEnabled(settings?.antiCheat?.enabled);
        showNotification('Настройки интервью сохранены', 'success');
    })
    .catch(error => {
        console.error(error);
        showNotification('Не удалось сохранить настройки', 'error');
    });
}

function renderSessions() {
    const container = document.getElementById('session-grid');
    if (!container) return;

    container.innerHTML = adminState.sessions.map(session => `
        <div class="session-card">
            <h3>${session.candidate}</h3>
            <div class="session-meta">Уровень: ${session.level}</div>
            <div class="session-meta">Статус: ${session.status === 'active' ? 'В процессе' : 'Ожидает'}</div>
            <div class="session-meta">Старт: ${session.started} • Время: ${session.timeSpent}</div>
            <div class="session-progress">
                <div class="session-progress-bar" style="width:${session.progress}%"></div>
            </div>
        </div>
    `).join('');
    renderAdminAnalytics();
}

function refreshSessions() {
    fetch(`${API_BASE}/admin/sessions/refresh`, { method: 'POST' })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Ошибка обновления сессий: ${response.status}`);
            }
            return response.json();
        })
        .then(sessions => {
            adminState.sessions = sessions;
            renderSessions();
            showNotification('Список интервью обновлен', 'info');
        })
        .catch(error => {
            console.error(error);
            showNotification('Не удалось обновить сессии', 'error');
        });
}

function renderCandidateResults() {
    const tbody = document.getElementById('candidate-table-body');
    const filter = document.getElementById('candidate-filter');
    if (!tbody) return;

    if (adminState.loading) {
        tbody.innerHTML = `<tr><td colspan="8">Загрузка...</td></tr>`;
        return;
    }

    const statusFilter = filter ? filter.value : 'all';
    const rows = adminState.candidates
        .filter(c => statusFilter === 'all' || c.status === statusFilter)
        .map(candidate => `
            <tr>
                <td>${candidate.name}</td>
                <td>${candidate.level}</td>
                <td>${candidate.overall}</td>
                <td>${candidate.technical}</td>
                <td>${candidate.communication}</td>
                <td>${candidate.attempts}</td>
                <td>${candidate.time}</td>
                <td><span class="status-badge ${candidate.status}">${candidate.status}</span></td>
            </tr>
        `).join('');

    tbody.innerHTML = rows || `<tr><td colspan="8">Кандидаты не найдены</td></tr>`;
    renderAdminAnalytics();
}

function mergeCandidateIntoState(candidate) {
    if (!candidate) return;
    if (!Array.isArray(adminState.candidates)) {
        adminState.candidates = [];
    }
    const index = adminState.candidates.findIndex(item => item.id === candidate.id);
    if (index >= 0) {
        adminState.candidates[index] = candidate;
    } else {
        adminState.candidates.unshift(candidate);
    }
}

async function createCandidateCard(firstName, patronymic, extra = {}) {
    const normalizedFirstName = typeof firstName === 'string' ? firstName.trim() : '';
    const normalizedPatronymic = typeof patronymic === 'string' ? patronymic.trim() : '';

    if (!normalizedFirstName || !normalizedPatronymic) {
        const error = new Error('Имя и отчество обязательны для создания карточки кандидата.');
        showNotification(error.message, 'error');
        throw error;
    }

    const payload = {
        firstName: normalizedFirstName,
        patronymic: normalizedPatronymic,
        lastName: typeof extra.lastName === 'string' ? extra.lastName.trim() : '',
        level: extra.level || 'Junior',
        status: extra.status || 'review',
        overall: Number(extra.overall) || 0,
        technical: Number(extra.technical) || 0,
        communication: Number(extra.communication) || 0,
        attempts: Number(extra.attempts) || 0,
        time: extra.time || '—'
    };

    if (extra.id) {
        payload.id = String(extra.id).trim();
    }

    try {
        const response = await fetchWithTimeout(`${API_BASE}/admin/candidates`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }, 15000);
        const newCandidate = await response.json();
        mergeCandidateIntoState(newCandidate);
        renderCandidateResults();
        renderCandidateMetricsReport();
        renderAdminAnalytics();
        showNotification(`Карточка кандидата ${escapeHtml(newCandidate.name)} создана`, 'success');
        return newCandidate;
    } catch (error) {
        console.error('Failed to create candidate card', error);
        showNotification(error.message || 'Не удалось создать карточку кандидата', 'error');
        throw error;
    }
}

function renderAdminAnalytics() {
    const avgScoreEl = document.getElementById('admin-metric-avg-score');
    if (!avgScoreEl) return;

    const candidates = adminState.candidates || [];
    const sessions = adminState.sessions || [];
    const antiCheatEvents = adminState.antiCheatEvents || [];
    const hasData = candidates.length || sessions.length || antiCheatEvents.length;

    const baselineScore = adminState.stats?.avgScore || 0;
    const baselineApproval = adminState.stats?.approvalRate || 0;

    const scoreTrendEl = document.getElementById('admin-metric-score-trend');
    const passRateEl = document.getElementById('admin-metric-pass-rate');
    const avgTimeEl = document.getElementById('admin-metric-time');
    const activeEl = document.getElementById('admin-metric-active');
    const statusBreakdownEl = document.getElementById('admin-status-breakdown');
    const levelDistributionEl = document.getElementById('admin-level-distribution');
    const antiCheatSummaryEl = document.getElementById('admin-anti-cheat-summary');

    if (!hasData) {
        avgScoreEl.textContent = baselineScore ? `${baselineScore}` : '--';
        if (scoreTrendEl) scoreTrendEl.textContent = 'Нет данных';
        if (passRateEl) passRateEl.textContent = baselineApproval ? `${baselineApproval}%` : '--';
        if (avgTimeEl) avgTimeEl.textContent = '—';
        if (activeEl) activeEl.textContent = '0/0';
        if (statusBreakdownEl) statusBreakdownEl.textContent = 'Нет данных о кандидатах';
        if (levelDistributionEl) levelDistributionEl.innerHTML = '<li>Нет данных</li>';
        if (antiCheatSummaryEl) antiCheatSummaryEl.textContent = 'Инциденты отсутствуют';
        return;
    }

    const avgScore = candidates.length
        ? Math.round(candidates.reduce((sum, candidate) => sum + (Number(candidate.overall) || 0), 0) / candidates.length)
        : (baselineScore || 0);
    avgScoreEl.textContent = candidates.length ? `${avgScore}` : (avgScore ? `${avgScore}` : '--');

    if (scoreTrendEl) {
        if (!candidates.length) {
            scoreTrendEl.textContent = baselineScore ? `Фиксировано на ${baselineScore}` : 'Нет данных';
        } else {
            const diff = avgScore - baselineScore;
            if (!baselineScore) {
                scoreTrendEl.textContent = 'Исторические данные отсутствуют';
            } else if (diff === 0) {
                scoreTrendEl.textContent = `На уровне исторического (${baselineScore})`;
            } else {
                scoreTrendEl.textContent = `${diff > 0 ? '+' : ''}${diff} к историческому ${baselineScore}`;
            }
        }
    }

    const approvedCount = candidates.filter(candidate => candidate.status === 'approved').length;
    const passRate = candidates.length ? Math.round((approvedCount / candidates.length) * 100) : (baselineApproval || 0);
    if (passRateEl) {
        passRateEl.textContent = candidates.length ? `${passRate}%` : `${passRate}%`;
    }

    const avgTimeMinutes = candidates.length
        ? Math.round(
            candidates.reduce((sum, candidate) => {
                if (typeof candidate.time === 'number') {
                    return sum + candidate.time;
                }
                const numeric = parseInt(String(candidate.time || '').replace(/[^\d]/g, ''), 10);
                return sum + (isNaN(numeric) ? 0 : numeric);
            }, 0) / candidates.length
        )
        : 0;
    const fallbackAvgTime = adminState.stats?.avgTimeMinutes || avgTimeMinutes;
    if (avgTimeEl) {
        if (candidates.length && avgTimeMinutes) {
            avgTimeEl.textContent = `~${avgTimeMinutes} мин`;
        } else if (fallbackAvgTime) {
            avgTimeEl.textContent = `~${fallbackAvgTime} мин`;
        } else {
            avgTimeEl.textContent = '—';
        }
    }

    const activeSessions = sessions.filter(session => session.status === 'active').length;
    if (activeEl) {
        activeEl.textContent = `${activeSessions}/${sessions.length || 0}`;
    }

    if (statusBreakdownEl) {
        if (!candidates.length) {
            statusBreakdownEl.textContent = 'Нет данных о кандидатах';
        } else {
            const statusCounts = candidates.reduce((acc, candidate) => {
                const key = candidate.status || 'unknown';
                acc[key] = (acc[key] || 0) + 1;
                return acc;
            }, {});
            const statusText = Object.entries(statusCounts)
                .map(([status, count]) => `<span>${escapeHtml(status)}: ${count}</span>`)
                .join(' • ');
            statusBreakdownEl.innerHTML = statusText;
        }
    }

    if (levelDistributionEl) {
        if (!candidates.length) {
            levelDistributionEl.innerHTML = '<li>Нет данных</li>';
        } else {
            const levelCounts = candidates.reduce((acc, candidate) => {
                const key = candidate.level || 'N/A';
                acc[key] = (acc[key] || 0) + 1;
                return acc;
            }, {});
            const total = candidates.length || 1;
            levelDistributionEl.innerHTML = Object.entries(levelCounts)
                .map(([level, count]) => `<li><span>${escapeHtml(level)}</span><span>${Math.round((count / total) * 100)}% (${count})</span></li>`)
                .join('');
        }
    }

    if (antiCheatSummaryEl) {
        if (!antiCheatEvents.length) {
            antiCheatSummaryEl.textContent = 'Инциденты не обнаружены';
        } else {
            const lastEvent = antiCheatEvents[antiCheatEvents.length - 1];
            const lastTime = lastEvent?.createdAt ? new Date(lastEvent.createdAt).toLocaleTimeString() : '';
            antiCheatSummaryEl.innerHTML = `
                <div class="analytics-pills">
                    <span class="analytics-pill">${antiCheatEvents.length} событ.</span>
                    ${lastEvent?.type ? `<span class="analytics-pill warning">${escapeHtml(lastEvent.type)}</span>` : ''}
                    ${lastTime ? `<span class="analytics-pill info">Последнее: ${lastTime}</span>` : ''}
                </div>
            `;
        }
    }
}

function refreshAdminAnalytics() {
    renderAdminAnalytics();
    showNotification('Метрики админ-панели обновлены', 'info');
}

function renderAntiCheatEvents() {
    const container = document.getElementById('anti-cheat-events');
    if (!container) return;

    const events = adminState.antiCheatEvents || [];
    if (!events.length) {
        container.innerHTML = '<div class="anti-cheat-event">События отсутствуют</div>';
        return;
    }

    container.innerHTML = events.slice(-10).reverse().map(event => `
        <div class="anti-cheat-event">
            <div class="anti-cheat-event-type">${escapeHtml(event.type)}</div>
            <div class="anti-cheat-event-meta">${new Date(event.createdAt).toLocaleString()}</div>
            ${event.details ? `<div class="anti-cheat-event-details">${escapeHtml(JSON.stringify(event.details))}</div>` : ''}
        </div>
    `).join('');
    renderAdminAnalytics();
}

function downloadAdminReport(format) {
    const normalized = format === 'csv' ? 'csv' : 'json';
    fetch(`${API_BASE}/admin/export?format=${normalized}`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`Ошибка экспорта: ${response.status}`);
            }
            return response.blob();
        })
        .then(blob => {
            const url = URL.createObjectURL(blob);
            const extension = normalized === 'csv' ? 'csv' : 'json';
            triggerDownload(url, `admin-report-${Date.now()}.${extension}`);
        })
        .catch(error => {
            console.error(error);
            showNotification('Экспорт не удался', 'error');
        });
}

function triggerDownload(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// Запуск секундомера
function startTimer() {
    if (interviewState.timerInterval) {
        clearInterval(interviewState.timerInterval);
    }
    interviewState.timerInterval = setInterval(updateMetrics, 1000);
}

// Остановка секундомера
function stopTimer() {
    if (interviewState.timerInterval) {
        clearInterval(interviewState.timerInterval);
        interviewState.timerInterval = null;
    }
}

// Обновление времени каждую секунду
startTimer();

// Отслеживание скролла чата для показа кнопки прокрутки
const chatMessages = document.getElementById('chat-messages');
if (chatMessages) {
    chatMessages.addEventListener('scroll', () => {
        const scrollBtn = document.getElementById('scroll-to-bottom-btn');
        if (scrollBtn) {
            if (isChatAtBottom()) {
                scrollBtn.classList.remove('show');
            } else {
                scrollBtn.classList.add('show');
            }
        }
    });
}

const antiCheatCooldown = {};

function reportAntiCheatEvent(type, details = {}) {
    // Если античит отключен в режиме кандидата, игнорируем события
    if (!interviewState.antiCheatEnabled) {
        return;
    }

    const now = Date.now();
    if (antiCheatCooldown[type] && now - antiCheatCooldown[type] < 2000) {
        return;
    }
    antiCheatCooldown[type] = now;

    const event = {
        id: `client-${now}`,
        type,
        details,
        createdAt: new Date(now).toISOString()
    };
    interviewState.antiCheatEvents = [...(interviewState.antiCheatEvents || []), event].slice(-50);
    adminState.antiCheatEvents = [...(adminState.antiCheatEvents || []), event].slice(-50);
    renderAntiCheatEvents();
    logAntiCheat(type, details);
    recalculateInterviewMetrics('anti-cheat-event');

    fetch(`${API_BASE}/anti-cheat/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, details })
    }).catch(error => console.error('anti-cheat event', error));
}

// Хранилище для обработчиков событий античита
const antiCheatHandlers = {
    copy: null,
    paste: null,
    blur: null,
    visibilitychange: null,
    keydown: null
};

// Anti-cheat tracking: Детектирование событий копирования, вставки, переключения вкладок и DevTools
// Event handlers: copy, paste, blur, visibilitychange, keydown (F12, Ctrl+Shift+I/J/C)
// Clipboard detection: document.addEventListener('copy'), document.addEventListener('paste')
// Tab detection: window.addEventListener('blur'), document.addEventListener('visibilitychange')
// DevTools detection: window.addEventListener('keydown') for F12, Ctrl+Shift+I/J/C
function setupAntiCheatTracking() {
    // Удаляем старые обработчики, если они есть
    removeAntiCheatTracking();
    
    // Добавляем обработчики только если античит включен
    if (!interviewState.antiCheatEnabled) {
        return;
    }
    
    // Создаем обработчики для детектирования событий копирования
    antiCheatHandlers.copy = (event) => {
        reportAntiCheatEvent('clipboard-copy', { 
            selection: window.getSelection().toString().substring(0, 100) 
        });
    };
    
    // Обработчик вставки из буфера обмена
    antiCheatHandlers.paste = (event) => {
        reportAntiCheatEvent('clipboard-paste', {
            pastedLength: (event.clipboardData?.getData('text') || '').length
        });
    };
    
    // Обработчик потери фокуса окна
    antiCheatHandlers.blur = () => {
        reportAntiCheatEvent('window-blur', { timestamp: Date.now() });
    };
    
    // Обработчик изменения видимости вкладки
    antiCheatHandlers.visibilitychange = () => {
        if (document.hidden) {
            reportAntiCheatEvent('tab-hidden', { timestamp: Date.now() });
        }
    };
    
    // Обработчик открытия DevTools через горячие клавиши
    antiCheatHandlers.keydown = (event) => {
        const key = event.key.toLowerCase();
        if (key === 'f12' || (event.ctrlKey && event.shiftKey && ['i', 'j', 'c'].includes(key))) {
            reportAntiCheatEvent('devtools', { 
                key: key,
                detected: true 
            });
        }
    };
    
    // Добавляем обработчики событий для детектирования копирования/вставки
    document.addEventListener('copy', antiCheatHandlers.copy, true);
    document.addEventListener('paste', antiCheatHandlers.paste, true);
    
    // Добавляем обработчики для детектирования переключения вкладок
    window.addEventListener('blur', antiCheatHandlers.blur);
    document.addEventListener('visibilitychange', antiCheatHandlers.visibilitychange);
    
    // Добавляем обработчик для детектирования DevTools
    window.addEventListener('keydown', antiCheatHandlers.keydown);
    
    // Дополнительное детектирование DevTools через консоль (периодическая проверка)
    if (window.setInterval && interviewState.antiCheatEnabled) {
        const devtoolsCheckInterval = setInterval(() => {
            if (!interviewState.antiCheatEnabled) {
                clearInterval(devtoolsCheckInterval);
                return;
            }
            try {
                const detectDevTools = () => {
                    const element = new Image();
                    Object.defineProperty(element, 'id', {
                        get: function() {
                            reportAntiCheatEvent('devtools', { method: 'console-detection' });
                        }
                    });
                    console.log(element);
                    console.clear();
                };
                detectDevTools();
            } catch (e) {
                // Игнорируем ошибки детектирования
            }
        }, 2000);
    }
}

function removeAntiCheatTracking() {
    // Удаляем все обработчики, если они были установлены
    if (antiCheatHandlers.copy) {
        document.removeEventListener('copy', antiCheatHandlers.copy);
        antiCheatHandlers.copy = null;
    }
    if (antiCheatHandlers.paste) {
        document.removeEventListener('paste', antiCheatHandlers.paste);
        antiCheatHandlers.paste = null;
    }
    if (antiCheatHandlers.blur) {
        window.removeEventListener('blur', antiCheatHandlers.blur);
        antiCheatHandlers.blur = null;
    }
    if (antiCheatHandlers.visibilitychange) {
        document.removeEventListener('visibilitychange', antiCheatHandlers.visibilitychange);
        antiCheatHandlers.visibilitychange = null;
    }
    if (antiCheatHandlers.keydown) {
        window.removeEventListener('keydown', antiCheatHandlers.keydown);
        antiCheatHandlers.keydown = null;
    }
}

// Обновление отображения статуса античита в header кандидата
function updateAntiCheatStatus() {
    const statusEl = document.getElementById('anti-cheat-status');
    if (!statusEl) {
        // Если элемент еще не создан, попробуем через небольшую задержку
        setTimeout(updateAntiCheatStatus, 100);
        return;
    }
    
    if (interviewState.antiCheatEnabled) {
        statusEl.textContent = 'античит включен';
        statusEl.className = 'anti-cheat-status enabled';
    } else {
        statusEl.textContent = 'античит выключен';
        statusEl.className = 'anti-cheat-status disabled';
    }
    console.log('Anti-cheat status updated:', interviewState.antiCheatEnabled);
}

function updateAntiCheatToggleUI() {
    const btn = document.getElementById('anti-cheat-toggle');
    if (btn) {
        if (interviewState.antiCheatEnabled) {
            btn.textContent = 'Античит: вкл';
            btn.classList.remove('off');
        } else {
            btn.textContent = 'Античит: выкл';
            btn.classList.add('off');
        }
    }
    // Также обновляем статус в header даже если кнопки нет на экране
    updateAntiCheatStatus();
}

function toggleAntiCheat() {
    const enabled = setAntiCheatEnabled(!interviewState.antiCheatEnabled);
    showNotification(
        enabled
            ? 'Режим античита включен для текущего интервью.'
            : 'Режим античита отключен для текущего интервью.',
        'info'
    );
}

// Обработчик изменения галочки античита в админ-панели
function handleAntiCheatToggle() {
    const checkbox = document.getElementById('antiCheatEnabled');
    if (!checkbox) return;
    
    setAntiCheatEnabled(checkbox.checked);
    console.log('Anti-cheat toggled:', interviewState.antiCheatEnabled);
}

// Export functions to window for HTML handlers
if (typeof window !== 'undefined') {
    window.openAdminPanel = openAdminPanel;
    window.returnToCandidate = returnToCandidate;
    window.syncAdminState = syncAdminState;
    window.startInterview = startInterview; // Also export here for reliability
    window.runCode = runCode;
    window.executeManualRun = executeManualRun;
    window.submitSolution = submitSolution;
    window.sendMessage = sendMessage;
    window.handleChatKeyPress = handleChatKeyPress;
    window.scrollChatToBottom = scrollChatToBottom;
    window.changeLanguage = changeLanguage;
    window.handleTaskFilterChange = handleTaskFilterChange;
    window.handleNewTask = handleNewTask;
    window.cancelTaskEdit = cancelTaskEdit;
    window.saveInterviewSettings = saveInterviewSettings;
    window.refreshSessions = refreshSessions;
    window.renderCandidateResults = renderCandidateResults;
    window.refreshAdminAnalytics = refreshAdminAnalytics;
    window.downloadAdminReport = downloadAdminReport;
    window.handleAntiCheatToggle = handleAntiCheatToggle;
    window.downloadReport = downloadReport;
    window.refreshCandidateMetricsReport = renderCandidateMetricsReport;
    window.refreshTransparencyProtocol = renderTransparencyProtocol;
    window.downloadTransparencyProtocol = downloadTransparencyProtocol;
    window.downloadSystemLogs = (format) => logger.downloadLogs(format);
    window.clearSystemLogs = () => {
        logger.clearLogs();
        const viewer = document.getElementById('log-viewer-content');
        if (viewer) viewer.innerHTML = '';
        showNotification('Логи очищены', 'success');
    };
    window.showLogStats = () => {
        const stats = logger.getStats();
        alert(`Статистика логов:\n\n` +
              `Всего логов: ${stats.totalLogs}\n` +
              `Ошибок: ${stats.errors}\n` +
              `Предупреждений: ${stats.warnings}\n` +
              `Длительность сессии: ${Math.floor(stats.sessionDuration / 1000)} сек\n\n` +
              `По категориям:\n${Object.entries(stats.byCategory).map(([cat, count]) => `  ${cat}: ${count}`).join('\n')}\n\n` +
              `По уровням:\n${Object.entries(stats.byLevel).map(([level, count]) => `  ${level}: ${count}`).join('\n')}`);
    };
    window.retryModelAction = retryModelAction;
    window.createCandidateCard = createCandidateCard;
}

document.addEventListener('DOMContentLoaded', () => {
    // Set welcome time
    const welcomeTimeEl = document.getElementById('welcome-time');
    if (welcomeTimeEl) {
        welcomeTimeEl.textContent = new Date().toLocaleTimeString();
    }
    
    updateTaskFormUI('create');
    setAntiCheatEnabled(interviewState.antiCheatEnabled);
    startAntiCheatStatusWatcher();
    refreshCandidateInsights();
    renderAdminAnalytics();
    loadAdminData();
});

