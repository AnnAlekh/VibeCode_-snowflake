// Main application entry point - Refactored version
// This file imports all modules and wires everything together

// Import state management
import { interviewState, adminState, adminDefaults } from './js/modules/state.js';

// Import API utilities
import { API_BASE, fetchWithTimeout } from './js/modules/api.js';

// Import UI utilities
import { 
    showNotification, 
    showLoading, 
    showError, 
    updateProgress, 
    updateStage,
    escapeHtml 
} from './js/modules/ui-utils.js';

// Import screen management
import { setActiveScreen } from './js/modules/screen-manager.js';

// Import Monaco editor management
import { 
    initializeMonacoEditor, 
    getEditorCode, 
    changeLanguage as changeEditorLanguage 
} from './js/modules/monaco-manager.js';

// Import chat management
import {
    addChatMessage,
    showTypingIndicator,
    hideTypingIndicator,
    scrollChatToBottom,
    isChatAtBottom,
    handleChatKeyPress as chatKeyPressHandler,
    getIsProcessingMessage,
    setIsProcessingMessage
} from './js/modules/chat-manager.js';

// Import metrics management
import {
    pauseTimer,
    resumeTimer,
    withLLM,
    updateMetrics,
    calculateAverageScore,
    startTimer,
    stopTimer
} from './js/modules/metrics-manager.js';

// Import task rendering
import { displayTask, displayTestResults } from './js/modules/task-renderer.js';

// Import anti-cheat
import {
    reportAntiCheatEvent,
    setupAntiCheatTracking,
    removeAntiCheatTracking,
    updateAntiCheatStatus,
    handleAntiCheatToggle
} from './js/modules/anti-cheat.js';

// Import report management
import { showFinalReport, displayReport, downloadReport } from './js/modules/report-manager.js';

// ============================================================================
// GLOBAL FUNCTIONS FOR HTML HANDLERS
// ============================================================================

// Screen navigation
window.openAdminPanel = function() {
    setActiveScreen('admin-panel');
    if (!adminState.tasks.length && !adminState.loading) {
        loadAdminData();
    } else {
        renderAdminPanel();
    }
};

window.returnToCandidate = function() {
    if (interviewState.currentLevel) {
        setActiveScreen('interview-screen');
    } else {
        setActiveScreen('level-selector');
    }
};

// Interview flow
window.startInterview = async function(level) {
    interviewState.currentLevel = level;
    interviewState.additionalQuestionsCount = 0;
    interviewState.stage = 'interview';
    interviewState.metrics.startTime = Date.now();
    interviewState.metrics.pausedTime = 0;
    interviewState.metrics.lastPauseStart = null;

    setActiveScreen('interview-screen');
    updateAntiCheatStatus();
    
    setTimeout(() => {
        initializeMonacoEditor();
    }, 100);

    startTimer();
    updateMetrics();

    await generateFirstTask(level);
};

window.changeLanguage = function() {
    changeEditorLanguage();
};

window.runCode = async function() {
    const code = getEditorCode();
    if (!code.trim()) {
        showNotification('Напишите код перед запуском!', 'warning');
        return;
    }

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
        displayTestResults(results);
        
        const visibleCases = Array.isArray(results.visible) ? results.visible : [];
        const allPassed = visibleCases.length && visibleCases.every(t => t.passed);
        if (allPassed) {
            showNotification('Все видимые тесты пройдены!', 'success');
        } else {
            showNotification('Некоторые тесты не пройдены', 'warning');
        }
    } catch (error) {
        console.error('Error running tests:', error);
        showNotification('Ошибка при запуске тестов', 'error');
    }
};

window.executeManualRun = async function() {
    if (!interviewState.editor) return;
    const code = getEditorCode();
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
};

window.submitSolution = async function() {
    const code = getEditorCode();
    
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

        const visibleCases = Array.isArray(testResults.visible) ? testResults.visible : [];
        const hiddenCases = Array.isArray(testResults.hidden) ? testResults.hidden : [];
        const visiblePassed = visibleCases.length ? visibleCases.every(t => t.passed) : false;
        const hiddenPassed = hiddenCases.length ? hiddenCases.every(t => t.passed) : false;

        if (visiblePassed && !hiddenPassed) {
            showNotification('Обнаружена ошибка в скрытых тестах', 'warning');
            const errorResponse = await fetch(`${API_BASE}/solutions/analyze-error`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code: code,
                    task: interviewState.currentTask,
                    failedTests: hiddenCases.filter(t => !t.passed),
                    visiblePassed: true
                })
            });

            const errorAnalysis = await errorResponse.json();
            addChatMessage('assistant', `Анализ ошибки:\n\n${errorAnalysis.explanation}\n\nПодсказка: ${errorAnalysis.suggestedFix}`);
            updateStage(3, 'active');
            return;
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

        interviewState.taskHistory.push({
            task: interviewState.currentTask,
            code: code,
            analysis: analysis,
            score: analysis.overallScore
        });

        interviewState.metrics.tasksCount++;
        interviewState.metrics.overallScore = calculateAverageScore();
        updateMetrics();

        updateStage(3, 'completed');
        updateProgress(60);
        showNotification('Решение проанализировано!', 'success');

        if (interviewState.metrics.tasksCount === 1) {
            await showAntiCheatDemo();
            updateStage(4, 'active');
            await askFollowUpQuestion(analysis);
        } else {
            if (interviewState.metrics.tasksCount === 2) {
                updateStage(4, 'active');
                await askTechnicalFollowUpQuestion(analysis);
            }
        }
    } catch (error) {
        console.error('Error submitting solution:', error);
        addChatMessage('assistant', 'Произошла ошибка при обработке решения. Попробуйте еще раз.');
    }
};

window.sendMessage = async function() {
    if (getIsProcessingMessage()) {
        return;
    }
    
    const input = document.getElementById('chat-input');
    const message = input.value.trim();
    
    if (!message) return;

    setIsProcessingMessage(true);
    addChatMessage('user', message);
    input.value = '';
    input.disabled = true;

    try {
        const lastAssistantMessage = interviewState.chatHistory.filter(m => m.role === 'assistant').pop();
        const isAnswerToFirstQuestion = interviewState.metrics.tasksCount === 1 && 
                                         interviewState.chatHistory.length >= 2 &&
                                         lastAssistantMessage && 
                                         lastAssistantMessage.content.includes('?');
        
        let questionsAfterSecondTask = 0;
        if (interviewState.metrics.tasksCount === 2) {
            const secondTaskMessageIndex = interviewState.chatHistory.findIndex(m => 
                m.role === 'assistant' && 
                (m.content.includes('Задача уровня') && m.content.includes('сгенерирована'))
            );
            
            if (secondTaskMessageIndex >= 0) {
                questionsAfterSecondTask = interviewState.chatHistory
                    .slice(secondTaskMessageIndex + 1)
                    .filter(m => m.role === 'assistant' && m.content.includes('?')).length;
            }
        }
        
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
                                             !isAnswerToAdditionalQuestion;
        const isAnswerToThirdQuestion = interviewState.metrics.tasksCount === 2 && 
                                         interviewState.chatHistory.length >= 2 &&
                                         lastAssistantMessage && 
                                         lastAssistantMessage.content.includes('?') &&
                                         questionsAfterSecondTask === 2 &&
                                         !isAnswerToAdditionalQuestion;
        
        if (isAnswerToFirstQuestion) {
            await handleCandidateAnswer(message);
        } else if (isAnswerToAdditionalQuestion && interviewState.metrics.tasksCount === 1) {
            await handleAdditionalAnswer(message, 1);
        } else if (isAnswerToTechnicalQuestion) {
            await handleTechnicalAnswer(message);
        } else if (isAnswerToAdditionalQuestion && interviewState.metrics.tasksCount === 2) {
            await handleAdditionalAnswer(message, 2);
        } else if (isAnswerToThirdQuestion) {
            await handleThirdAnswer(message);
        } else if (interviewState.metrics.tasksCount === 2) {
            try {
                pauseTimer();
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
                }, {}, 120000);

                const data = await response.json();
                const generationTime = Date.now() - generationStart;
                resumeTimer();
                
                let responseText = data.response || '';
                responseText = responseText.replace(/<think>[\s\S]*?<\/redacted_reasoning>/gi, '');
                responseText = responseText.replace(/<\/redacted_reasoning>[\s\S]*?<think>/gi, '');
                
                const sentences = responseText.split(/[.!?]\s+/);
                if (sentences.length > 1 && sentences[sentences.length - 1].length > 20) {
                    responseText = sentences[sentences.length - 1].trim();
                    if (!/[.!?]$/.test(responseText)) {
                        responseText += '.';
                    }
                }
                
                addChatMessage('assistant', responseText || 'Не удалось получить ответ. Попробуйте еще раз.', generationTime);

                if (interviewState.chatHistory.length >= 6) {
                    setTimeout(() => showFinalReport(), 2000);
                }
            } catch (error) {
                console.error('Error in dialogue:', error);
                hideTypingIndicator();
                resumeTimer();
                addChatMessage('assistant', `Ошибка: ${error.message}. Попробуйте еще раз.`);
            }
        }
    } catch (error) {
        console.error('Unexpected error in sendMessage:', error);
        hideTypingIndicator();
        resumeTimer();
        addChatMessage('assistant', `Произошла непредвиденная ошибка: ${error.message}. Попробуйте еще раз.`);
    } finally {
        setIsProcessingMessage(false);
        const inputEl = document.getElementById('chat-input');
        if (inputEl) {
            inputEl.disabled = false;
            inputEl.focus();
        }
        hideTypingIndicator();
    }
};

window.handleChatKeyPress = function(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        if (!getIsProcessingMessage()) {
            window.sendMessage();
        }
    }
};

window.scrollChatToBottom = scrollChatToBottom;

// Admin panel functions
window.syncAdminState = function() {
    loadAdminData(true);
};

window.handleTaskFilterChange = function() {
    const levelSelect = document.getElementById('task-level-filter');
    const topicSelect = document.getElementById('task-topic-filter');
    const searchInput = document.getElementById('task-search');

    if (levelSelect) adminState.filters.level = levelSelect.value;
    if (topicSelect) adminState.filters.topic = topicSelect.value;
    if (searchInput) adminState.filters.search = searchInput.value.trim();

    renderTaskTable();
};

window.handleNewTask = function(event) {
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
};

window.cancelTaskEdit = function() {
    const form = document.getElementById('new-task-form');
    if (form) {
        form.reset();
        const hidden = form.querySelector('#task-id-field');
        if (hidden) hidden.value = '';
    }
    adminState.taskFormMode = 'create';
    adminState.editingTaskId = null;
    updateTaskFormUI('create');
};

window.saveInterviewSettings = function(event) {
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
        interviewState.antiCheatEnabled = settings?.antiCheat?.enabled !== false;
        setupAntiCheatTracking();
        updateAntiCheatStatus();
        showNotification('Настройки интервью сохранены', 'success');
    })
    .catch(error => {
        console.error(error);
        showNotification('Не удалось сохранить настройки', 'error');
    });
};

window.refreshSessions = function() {
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
};

window.renderCandidateResults = function() {
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
};

window.downloadAdminReport = function(format) {
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
            const a = document.createElement('a');
            a.href = url;
            a.download = `admin-report-${Date.now()}.${extension}`;
            a.click();
            URL.revokeObjectURL(url);
        })
        .catch(error => {
            console.error(error);
            showNotification('Экспорт не удался', 'error');
        });
};

window.handleAntiCheatToggle = handleAntiCheatToggle;

// Make downloadReport available globally
window.downloadReport = downloadReport;

// ============================================================================
// INTERNAL FUNCTIONS (not exposed to HTML)
// ============================================================================

async function generateFirstTask(level) {
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
        
        interviewState.currentTask = task;
        displayTask(task);
        
        updateStage(1, 'completed', duration);
        updateStage(2, 'active');
        updateProgress(20);
        showNotification('Задача сгенерирована!', 'success');
        
        addChatMessage('assistant', 'Привет! Я ваш интервьюер. Давайте начнем с первой задачи. Прочитайте условие и напишите решение.', duration);
    } catch (error) {
        console.error('Error generating task:', error);
        addChatMessage('assistant', 'Ошибка при генерации задачи. Убедитесь, что backend сервер запущен на http://localhost:3000');
        showError('Не удалось подключиться к серверу. Убедитесь, что backend запущен.');
    }
}

// Note: The following interview flow functions (askFollowUpQuestion, handleCandidateAnswer, etc.)
// are very complex and interconnected. They are kept in a separate file for now.
// For a complete refactoring, these should be moved to js/modules/interview-flow.js

// Placeholder implementations - these need to be imported from interview-flow.js
// For now, keeping them here to maintain functionality
async function askFollowUpQuestion(analysis) {
    // This is a complex function - keeping original implementation
    // Should be moved to interview-flow.js module
    console.warn('askFollowUpQuestion needs to be implemented in interview-flow.js');
}

async function handleCandidateAnswer(answer) {
    console.warn('handleCandidateAnswer needs to be implemented in interview-flow.js');
}

async function handleAdditionalAnswer(answer, taskNumber) {
    console.warn('handleAdditionalAnswer needs to be implemented in interview-flow.js');
}

async function askTechnicalFollowUpQuestion(analysis) {
    console.warn('askTechnicalFollowUpQuestion needs to be implemented in interview-flow.js');
}

async function handleTechnicalAnswer(answer) {
    console.warn('handleTechnicalAnswer needs to be implemented in interview-flow.js');
}

async function handleThirdAnswer(answer) {
    console.warn('handleThirdAnswer needs to be implemented in interview-flow.js');
}

async function showAntiCheatDemo() {
    if (!interviewState?.antiCheatEnabled) {
        console.log('Anti-cheat disabled — skipping demo output');
        return;
    }

    addChatMessage('assistant', 'Демонстрация системы защиты от читерства:');
    
    const demoMessages = [
        'Обнаружено копирование кода из буфера обмена',
        'Обнаружено открытие DevTools',
        'Обнаружено переключение вкладок',
        'Обнаружен период бездействия',
        'Обнаружены множественные вставки кода'
    ];

    for (const msg of demoMessages) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        addChatMessage('system', `[Система защиты] ${msg}`);
    }

    addChatMessage('assistant', 'Система защиты отслеживает различные подозрительные действия для обеспечения честности интервью.');
}

// Admin panel internal functions
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
        adminState.settings = data.settings || adminDefaults.settings;
        adminState.stats = data.stats || adminDefaults.stats;
        adminState.reports = data.reports || [];
        adminState.antiCheatEvents = data.antiCheatEvents || adminDefaults.antiCheatEvents;
        adminState.lastSync = new Date().toISOString();
        
        interviewState.antiCheatEnabled = adminState.settings?.antiCheat?.enabled !== false;
        setupAntiCheatTracking();
        updateAntiCheatStatus();
        
        showNotification('Данные админ-панели синхронизированы', 'success');
    } catch (error) {
        console.error(error);
        adminState.error = error.message;
        if (!adminState.tasks.length) {
            adminState.tasks = adminDefaults.tasks;
            adminState.sessions = adminDefaults.sessions;
            adminState.candidates = adminDefaults.candidates;
            adminState.settings = adminDefaults.settings;
            adminState.stats = adminDefaults.stats;
            adminState.reports = adminDefaults.reports;
            adminState.antiCheatEvents = adminDefaults.antiCheatEvents;
        }
        interviewState.antiCheatEnabled = adminState.settings?.antiCheat?.enabled !== false;
        setupAntiCheatTracking();
        updateAntiCheatStatus();
        showNotification('Не удалось получить данные админ-панели. Используются локальные данные.', 'warning');
    } finally {
        adminState.loading = false;
        renderAdminPanel();
    }
}

function renderAdminPanel() {
    renderTaskTable();
    hydrateInterviewForm();
    renderSessions();
    renderCandidateResults();
    renderAntiCheatEvents();
    
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

function hydrateInterviewForm() {
    const form = document.getElementById('interview-settings-form');
    if (!form) return;

    const settings = adminState.settings || adminDefaults.settings;
    if (!settings) return;
    
    interviewState.antiCheatEnabled = settings?.antiCheat?.enabled !== false;
    setupAntiCheatTracking();
    updateAntiCheatStatus();

    form.duration.value = settings.duration;
    form.maxTasks.value = settings.maxTasks;
    form.model.value = settings.model;
    form.temperature.value = settings.temperature;
    form.metricsTechnical.checked = !!settings.metrics?.technical;
    form.metricsCommunication.checked = !!settings.metrics?.communication;
    form.metricsReadability.checked = !!settings.metrics?.readability;
    form.antiCheatClipboard.checked = !!settings.antiCheat?.clipboard;
    form.antiCheatDevtools.checked = !!settings.antiCheat?.devtools;
    form.antiCheatExtensions.checked = !!settings.antiCheat?.extensions;
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
}

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    // Set welcome time
    const welcomeTimeEl = document.getElementById('welcome-time');
    if (welcomeTimeEl) {
        welcomeTimeEl.textContent = new Date().toLocaleTimeString();
    }

    // Initialize timer
    startTimer();
    updateMetrics();

    // Setup anti-cheat tracking
    setupAntiCheatTracking();
    updateAntiCheatStatus();

    // Setup chat scroll button
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

    // Load admin data
    loadAdminData();
});

