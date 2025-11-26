let interviewState = {
    currentLevel: null,
    currentTask: null,
    taskHistory: [],
    chatHistory: [],
    metrics: {
        tasksCount: 0,
        overallScore: 0,
        timeSpent: 0,
        startTime: null,
        pausedTime: 0, // Время на паузе (LLM работает)
        lastPauseStart: null // Время начала последней паузы
    },
    stage: 'level-selection',
    stageDurations: {},
    editor: null,
    timerInterval: null
};

const API_BASE = 'http://localhost:3000/api';

require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs' } });
require(['vs/editor/editor.main'], function () {
    interviewState.editor = monaco.editor.create(document.getElementById('monaco-editor'), {
        value: '# Напишите ваше решение здесь\n\ndef solution(arr):\n    pass\n',
        language: 'python',
        theme: 'vs-dark',
        fontSize: 14,
        minimap: { enabled: false },
        automaticLayout: true,
        scrollBeyondLastLine: false
    });
});

document.getElementById('welcome-time').textContent = new Date().toLocaleTimeString();
async function startInterview(level) {
    interviewState.currentLevel = level;
    interviewState.stage = 'interview';
    interviewState.metrics.startTime = Date.now();
    interviewState.metrics.pausedTime = 0;
    interviewState.metrics.lastPauseStart = null;

    // Переключение экранов
    document.getElementById('level-selector').classList.remove('active');
    document.getElementById('interview-screen').classList.add('active');

    startTimer();
    updateMetrics();

    await generateFirstTask(level);
}
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

function displayTask(task) {
    const container = document.getElementById('task-view');
    document.getElementById('task-level').textContent = task.level;
    
    let html = `
        <div class="task-title">Задача ${interviewState.metrics.tasksCount + 1}</div>
    `;

    if (task.task) {
        html += `<div class="task-description">${escapeHtml(task.task)}</div>`;
    } else if (task.description) {
        html += `<div class="task-description">${escapeHtml(task.description)}</div>`;
    }

    if (task.requirements && task.requirements.length > 0) {
        html += '<div style="margin-top: 20px;"><h3 style="color: #4ec9b0; margin-bottom: 10px; font-size: 16px;">📋 Требования:</h3><ul style="margin-left: 20px; line-height: 1.8;">';
        task.requirements.forEach(req => {
            html += `<li style="margin: 10px 0; padding-left: 5px;">${escapeHtml(req)}</li>`;
        });
        html += '</ul></div>';
    }

    if (task.example) {
        html += `
            <div class="task-examples" style="margin-top: 20px;">
                <h3 style="color: #4ec9b0; margin-bottom: 15px; font-size: 16px;">💡 Пример:</h3>
                <div class="example">
                    <div class="code-block">${escapeHtml(task.example)}</div>
                </div>
            </div>
        `;
    } else if (task.examples && task.examples.length > 0) {
        html += '<div class="task-examples" style="margin-top: 20px;"><h3 style="color: #4ec9b0; margin-bottom: 15px; font-size: 16px;">💡 Примеры:</h3>';
        task.examples.forEach((example, i) => {
            html += `
                <div class="example">
                    <div class="example-title">Пример ${i + 1}:</div>
                    ${example.input ? `<div class="code-block">Вход: ${escapeHtml(example.input)}</div>` : ''}
                    ${example.output ? `<div class="code-block">Выход: ${escapeHtml(example.output)}</div>` : ''}
                    ${example.explanation ? `<div style="margin-top: 8px; color: #858585; font-size: 13px; line-height: 1.6;">${escapeHtml(example.explanation)}</div>` : ''}
                </div>
            `;
        });
        html += '</div>';
    }

    if (task.hint) {
        html += `
            <div style="margin-top: 20px; padding: 15px; background: #252526; border-left: 4px solid #4ec9b0; border-radius: 4px;">
                <h3 style="color: #4ec9b0; margin-bottom: 10px; font-size: 16px;">💡 Подсказка:</h3>
                <div style="line-height: 1.6;">${escapeHtml(task.hint)}</div>
            </div>
        `;
    } else if (task.hints && task.hints.length > 0) {
        html += '<div style="margin-top: 20px;"><h3 style="color: #4ec9b0; margin-bottom: 10px; font-size: 16px;">💡 Подсказки:</h3><ul style="margin-left: 20px;">';
        task.hints.forEach(hint => {
            html += `<li style="margin: 8px 0; line-height: 1.6;">${escapeHtml(hint)}</li>`;
        });
        html += '</ul></div>';
    }

    if (task.constraints && task.constraints.length > 0) {
        html += '<div style="margin-top: 20px;"><h3 style="color: #4ec9b0; margin-bottom: 10px; font-size: 16px;">📋 Ограничения:</h3><ul style="margin-left: 20px; line-height: 1.8;">';
        task.constraints.forEach(constraint => {
            html += `<li style="margin: 10px 0; padding-left: 5px;">${escapeHtml(constraint)}</li>`;
        });
        html += '</ul></div>';
    }

    if (task.starterCode) {
        html += `
            <div style="margin-top: 20px;">
                <h3 style="color: #4ec9b0; margin-bottom: 10px; font-size: 16px;">📝 Шаблон кода:</h3>
                <div class="code-block" style="white-space: pre-wrap; font-family: 'Courier New', monospace;">${escapeHtml(task.starterCode)}</div>
            </div>
        `;
    }

    container.innerHTML = html;
}

// Запуск кода
async function runCode() {
    const code = interviewState.editor.getValue();
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
        
        const allPassed = results.visible.every(t => t.passed);
        if (allPassed) {
            showNotification('Все видимые тесты пройдены! ✓', 'success');
        } else {
            showNotification('Некоторые тесты не пройдены', 'warning');
        }
    } catch (error) {
        console.error('Error running tests:', error);
        showNotification('Ошибка при запуске тестов', 'error');
    }
}

// Отображение результатов тестов
function displayTestResults(results) {
    const container = document.getElementById('task-view');
    let testHtml = '<div class="test-results"><h3 style="color: #4ec9b0; margin-bottom: 15px;">✅ Результаты тестов:</h3>';

    if (results.visible) {
        results.visible.forEach((test, i) => {
            testHtml += `
                <div class="test-item">
                    <div class="test-icon ${test.passed ? 'passed' : 'failed'}">${test.passed ? '✓' : '✗'}</div>
                    <div>
                        <div>Тест ${i + 1}: ${test.passed ? 'Пройден' : 'Не пройден'}</div>
                        ${test.error ? `<div style="color: #ce9178; font-size: 12px; margin-top: 3px;">${escapeHtml(test.error)}</div>` : ''}
                    </div>
                </div>
            `;
        });
    }

    testHtml += '</div>';
    
    // Добавляем результаты к задаче
    const existing = container.innerHTML;
    container.innerHTML = existing + testHtml;
}

async function submitSolution() {
    const code = interviewState.editor.getValue();
    
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
        const visiblePassed = testResults.visible.every(t => t.passed);
        const hiddenPassed = testResults.hidden.every(t => t.passed);

        if (visiblePassed && !hiddenPassed) {
            showNotification('Обнаружена ошибка в скрытых тестах', 'warning');
            const errorResponse = await fetch(`${API_BASE}/solutions/analyze-error`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code: code,
                    task: interviewState.currentTask,
                    failedTests: testResults.hidden.filter(t => !t.passed),
                    visiblePassed: true
                })
            });

            const errorAnalysis = await errorResponse.json();
            addChatMessage('assistant', `🔍 Анализ ошибки:\n\n${errorAnalysis.explanation}\n\n💡 Подсказка: ${errorAnalysis.suggestedFix}`);
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

        // Сохранение в историю
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
            updateStage(4, 'active');
            await askFollowUpQuestion(analysis);
        } else {
            if (interviewState.metrics.tasksCount === 2) {
                await showAntiCheatDemo();
                await startFinalDialogue();
            }
        }
    } catch (error) {
        console.error('Error submitting solution:', error);
        addChatMessage('assistant', 'Произошла ошибка при обработке решения. Попробуйте еще раз.');
    }
}

// Вопрос после первой задачи
async function askFollowUpQuestion(analysis) {
    try {
        showNotification('Генерация вопроса интервьюера...', 'info');
        updateStage(4, 'active');
        
        const { result: data, duration: generationTime } = await withLLM(async () => {
            const response = await fetch(`${API_BASE}/chat/question`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    task: interviewState.currentTask,
                    solution: interviewState.editor.getValue(),
                    analysis: analysis
                })
            });
    
            if (!response.ok) {
                throw new Error('Failed to generate question');
            }
    
            return await response.json();
        });

        updateStage(4, 'completed', generationTime);
        
        // Очищаем вопрос от размышлений - берем только последний вопрос
        let question = data.question || '';
        
        // Убираем reasoning блоки
        question = question.replace(/<think>[\s\S]*?<\/redacted_reasoning>/gi, '');
        question = question.replace(/<\/redacted_reasoning>[\s\S]*?<think>/gi, '');
        
        // Если есть несколько предложений, берем только последний вопрос
        const questions = question.split(/[.!?]\s+/).filter(s => s.includes('?'));
        if (questions.length > 0) {
            question = questions[questions.length - 1].trim();
            if (!question.endsWith('?')) {
                question += '?';
            }
        }
        
        // Если вопрос начинается с размышлений, обрезаем до первого вопроса
        const firstQuestionIndex = question.indexOf('?');
        if (firstQuestionIndex > 100) {
            // Если до первого вопроса больше 100 символов, ищем последний вопрос
            const lastQuestionIndex = question.lastIndexOf('?');
            if (lastQuestionIndex > 0) {
                question = question.substring(question.lastIndexOf('.', lastQuestionIndex - 50) + 1).trim();
            }
        }
        
        addChatMessage('assistant', question, generationTime);
        showNotification('Вопрос задан! Ответьте в чате', 'info');
    } catch (error) {
        console.error('Error generating question:', error);
        showNotification('Ошибка при генерации вопроса', 'error');
    }
}

// Обработка ответа кандидата
async function handleCandidateAnswer(answer) {
    addChatMessage('user', answer);

    try {
        showNotification('Оценка вашего ответа...', 'info');
        updateStage(3, 'active');

        const { result: evaluation, duration: evaluationTime } = await withLLM(async () => {
            const evalResponse = await fetch(`${API_BASE}/chat/evaluate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    question: interviewState.chatHistory[interviewState.chatHistory.length - 2].content,
                    answer: answer,
                    solution: interviewState.editor.getValue()
                })
            });

            if (!evalResponse.ok) {
                throw new Error(`HTTP error! status: ${evalResponse.status}`);
            }

            return await evalResponse.json();
        });

        console.log('Evaluation result:', evaluation);
        updateStage(3, 'completed', evaluationTime);

        if (evaluation.feedback) {
            addChatMessage('assistant', evaluation.feedback, evaluationTime);
        }

        const nextLevel = determineNextLevel(evaluation);
        console.log('Next level determined:', nextLevel, 'based on evaluation:', evaluation);

        // Генерация следующей задачи с адаптацией
        await generateNextTask(evaluation, nextLevel);
    } catch (error) {
        console.error('Error handling answer:', error);
        showNotification('Ошибка при обработке ответа', 'error');
        addChatMessage('assistant', 'Произошла ошибка. Попробуйте еще раз.');
    }
}

// Генерация следующей задачи
async function generateNextTask(evaluation, nextLevel = null) {
    updateStage(4, 'completed');
    updateStage(5, 'active');
    updateProgress(70);
    showNotification('Генерация второй задачи...', 'info');
    
    // Определяем уровень, если не передан
    if (!nextLevel) {
        nextLevel = determineNextLevel(evaluation);
    }
    
    console.log('Generating next task with level:', nextLevel);
    
    addChatMessage('assistant', `Отлично! На основе вашего ответа я подобрал задачу уровня ${nextLevel}. Генерирую задачу...`);

    // Streaming генерация
    const taskContainer = document.getElementById('task-view');
    taskContainer.innerHTML = '<div class="loading"><span class="streaming-text">Генерация задачи уровня ' + nextLevel + '...</span></div>';

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
                    }
                })
            });

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let fullContent = '';

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
                                taskContainer.innerHTML = `<div class="loading"><span class="streaming-text">${escapeHtml(fullContent)}</span></div>`;
                            }
                            if (data.done && data.task) {
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
        displayTask(task);
        updateStage(5, 'completed', generationTime);
        updateProgress(80);
        showNotification(`Задача уровня ${nextLevel} сгенерирована!`, 'success');
        addChatMessage('assistant', `Задача уровня ${nextLevel} сгенерирована! Приступайте к решению.`, generationTime);
    } catch (error) {
        console.error('Error in streaming:', error);
        showNotification('Ошибка при генерации задачи', 'error');
        addChatMessage('assistant', 'Ошибка при генерации задачи. Попробуйте еще раз.');
    }
}

// Определение следующего уровня
function determineNextLevel(evaluation) {
    // Используем оценку из evaluation или общую оценку
    const score = evaluation.score || evaluation.overallScore || 0;
    const understanding = evaluation.understanding || 0;
    const communication = evaluation.communication || 0;
    
    // Комбинированная оценка
    const combinedScore = (score + understanding + communication) / 3;
    
    console.log('Determining level:', { score, understanding, communication, combinedScore });
    
    if (combinedScore >= 85) {
        return 'Middle';
    } else if (combinedScore >= 70) {
        return 'Junior+';
    } else if (combinedScore >= 50) {
        return 'Junior';
    }
    return 'Junior-';
}

// Демонстрация античита
async function showAntiCheatDemo() {
    addChatMessage('assistant', '🔒 Демонстрация системы защиты от читерства:');
    
    const demoMessages = [
        '🔍 Обнаружено копирование кода из буфера обмена',
        '⚠️ Обнаружено открытие DevTools',
        '📑 Обнаружено переключение вкладок',
        '⏸️ Обнаружен период бездействия',
        '⚡ Обнаружены множественные вставки кода'
    ];

    for (const msg of demoMessages) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        addChatMessage('system', `[Система защиты] ${msg}`);
    }

    addChatMessage('assistant', 'Система защиты отслеживает различные подозрительные действия для обеспечения честности интервью.');
}

// Финальный диалог
async function startFinalDialogue() {
    try {
        const { result: data, duration: generationTime } = await withLLM(async () => {
            const response = await fetch(`${API_BASE}/chat/final-question`, {
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
        
        // Очищаем вопрос от reasoning
        let question = data.question || '';
        question = question.replace(/<think>[\s\S]*?<\/redacted_reasoning>/gi, '');
        question = question.replace(/<\/redacted_reasoning>[\s\S]*?<think>/gi, '');
        
        // Берем только последний вопрос
        const questions = question.split(/[.!?]\s+/).filter(s => s.includes('?'));
        if (questions.length > 0) {
            question = questions[questions.length - 1].trim();
            if (!question.endsWith('?')) {
                question += '?';
            }
        }
        
        addChatMessage('assistant', question, generationTime);
    } catch (error) {
        console.error('Error generating final question:', error);
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

    isProcessingMessage = true;
    addChatMessage('user', message);
    input.value = '';
    input.disabled = true; // Блокируем ввод во время обработки

    try {
        // Обработка ответа
        // Проверяем, что это ответ на вопрос после первой задачи
        const lastAssistantMessage = interviewState.chatHistory.filter(m => m.role === 'assistant').pop();
        const isAnswerToFirstQuestion = interviewState.metrics.tasksCount === 1 && 
                                         interviewState.chatHistory.length >= 2 &&
                                         lastAssistantMessage && 
                                         lastAssistantMessage.content.includes('?');
        
        if (isAnswerToFirstQuestion) {
            // Ответ на вопрос после первой задачи
            await handleCandidateAnswer(message);
        } else if (interviewState.metrics.tasksCount === 2) {
        // Финальный диалог
        try {
            pauseTimer(); // Останавливаем секундомер
            const generationStart = Date.now();
            
            const response = await fetch(`${API_BASE}/chat/dialogue`, {
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
            });

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
            
            addChatMessage('assistant', responseText, generationTime);

            // После нескольких обменов показываем отчет
            if (interviewState.chatHistory.length >= 6) {
                setTimeout(() => showFinalReport(), 2000);
            }
        } catch (error) {
            console.error('Error in dialogue:', error);
        }
    }
    } finally {
        isProcessingMessage = false;
        input.disabled = false; // Разблокируем ввод
        input.focus(); // Возвращаем фокус
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

// Добавление сообщения в чат
function addChatMessage(role, content, generationTime = null) {
    // Убираем размышления сети (reasoning) - оставляем только вопрос
    let cleanContent = content;
    
    // Удаляем блоки с reasoning
    cleanContent = cleanContent.replace(/<think>[\s\S]*?<\/redacted_reasoning>/gi, '');
    cleanContent = cleanContent.replace(/<\/redacted_reasoning>[\s\S]*?<think>/gi, '');
    cleanContent = cleanContent.replace(/reasoning[:\s]*[\s\S]*?(?=\n\n|\n[А-Я]|$)/gi, '');
    
    // Убираем длинные размышления перед вопросом
    const questionMatch = cleanContent.match(/([А-Я][^.!?]*[.!?])/);
    if (questionMatch && cleanContent.length > 200) {
        // Если текст очень длинный, ищем последний вопрос
        const sentences = cleanContent.split(/[.!?]\s+/);
        const lastQuestion = sentences.filter(s => s.length > 20 && /[А-Я]/.test(s)).pop();
        if (lastQuestion) {
            cleanContent = lastQuestion.trim();
            if (!/[.!?]$/.test(cleanContent)) {
                cleanContent += '.';
            }
        }
    }
    
    // Если это assistant и текст содержит размышления, берем только вопрос
    if (role === 'assistant' && cleanContent.includes('Хорошо')) {
        // Ищем последний вопрос (предложение с вопросительным знаком)
        const questions = cleanContent.match(/[^.!?]*\?/g);
        if (questions && questions.length > 0) {
            cleanContent = questions[questions.length - 1].trim();
        }
    }
    
    const messagesContainer = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    
    const time = new Date().toLocaleTimeString();
    
    // Формируем время с учетом времени генерации
    let timeHtml = `<div class="message-time">${time}`;
    if (generationTime !== null && role === 'assistant') {
        const seconds = (generationTime / 1000).toFixed(1);
        timeHtml += ` <span class="generation-time">(генерация: ${seconds}с)</span>`;
    }
    timeHtml += '</div>';
    
    messageDiv.innerHTML = `
        <div class="message-bubble">${escapeHtml(cleanContent)}</div>
        ${timeHtml}
    `;
    
    messagesContainer.appendChild(messageDiv);
    scrollChatToBottom();

    // Сохранение в историю
    interviewState.chatHistory.push({ 
        role, 
        content: cleanContent, 
        time,
        generationTime: generationTime || null
    });
}

// Прокрутка чата вниз
function scrollChatToBottom() {
    const messagesContainer = document.getElementById('chat-messages');
    messagesContainer.scrollTo({
        top: messagesContainer.scrollHeight,
        behavior: 'smooth'
    });
}

// Проверка, находится ли пользователь внизу чата
function isChatAtBottom() {
    const messagesContainer = document.getElementById('chat-messages');
    const threshold = 100; // пикселей от низа
    return messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight < threshold;
}

// Пауза секундомера (когда работает LLM)
function pauseTimer() {
    if (!interviewState.metrics.lastPauseStart) {
        interviewState.metrics.lastPauseStart = Date.now();
    }
}

// Возобновление секундомера (когда LLM закончил)
function resumeTimer() {
    if (interviewState.metrics.lastPauseStart) {
        const pauseDuration = Date.now() - interviewState.metrics.lastPauseStart;
        interviewState.metrics.pausedTime += pauseDuration;
        interviewState.metrics.lastPauseStart = null;
    }
}

async function withLLM(operation) {
    pauseTimer();
    const start = performance.now();
    try {
        const result = await operation();
        return { result, duration: performance.now() - start };
    } finally {
        resumeTimer();
    }
}

// Обновление метрик
function updateMetrics() {
    document.getElementById('tasks-count').textContent = interviewState.metrics.tasksCount;
    document.getElementById('overall-score').textContent = interviewState.metrics.overallScore;
    
    if (interviewState.metrics.startTime) {
        // Вычисляем активное время (общее время минус время на паузе)
        const totalElapsed = Date.now() - interviewState.metrics.startTime;
        const currentPause = interviewState.metrics.lastPauseStart ? 
            (Date.now() - interviewState.metrics.lastPauseStart) : 0;
        const activeTime = totalElapsed - interviewState.metrics.pausedTime - currentPause;
        
        const elapsed = Math.floor(activeTime / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        document.getElementById('time-spent').textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
}

// Расчет средней оценки
function calculateAverageScore() {
    if (interviewState.taskHistory.length === 0) return 0;
    const sum = interviewState.taskHistory.reduce((acc, t) => acc + (t.score || 0), 0);
    return Math.round(sum / interviewState.taskHistory.length);
}

// Показ финального отчета
async function showFinalReport() {
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
    } catch (error) {
        console.error('Error generating report:', error);
        showNotification('Ошибка при генерации отчета', 'error');
        showError('Ошибка при генерации отчета');
    }
}

// Отображение отчета
function displayReport(report) {
    const container = document.getElementById('report-content');
    container.innerHTML = `
        <h1 style="color: #4ec9b0; margin-bottom: 30px; font-size: 32px;">📊 Финальный отчет</h1>
        
        <div class="report-section">
            <h2>📈 Общая статистика</h2>
            <p><strong>Выполнено задач:</strong> ${report.summary.totalTasks}</p>
            <p><strong>Общая оценка:</strong> ${report.scores.overall}/100</p>
            <p><strong>Техническая оценка:</strong> ${report.scores.technical}/100</p>
            <p><strong>Коммуникативная оценка:</strong> ${report.scores.communication}/100</p>
            <p><strong>Время решения:</strong> ${Math.floor((interviewState.metrics.timeSpent || 0) / 1000 / 60)} минут</p>
        </div>

        <div class="report-section">
            <h2>✅ Сильные стороны</h2>
            <ul class="strengths-list">
                ${(report.strengths || []).map(s => `<li>${escapeHtml(s)}</li>`).join('')}
            </ul>
        </div>

        <div class="report-section">
            <h2>⚠️ Области для улучшения</h2>
            <ul class="weaknesses-list">
                ${(report.weaknesses || []).map(w => `<li>${escapeHtml(w)}</li>`).join('')}
            </ul>
        </div>

        <div class="report-section">
            <h2>📝 Детальный анализ</h2>
            <p style="line-height: 1.8; white-space: pre-wrap;">${escapeHtml(report.detailedAnalysis || 'Анализ недоступен')}</p>
        </div>

        ${report.recommendations && report.recommendations.length > 0 ? `
        <div class="report-section">
            <h2>💡 Рекомендации</h2>
            <ul style="margin-left: 20px;">
                ${report.recommendations.map(r => `<li style="margin: 10px 0; line-height: 1.6;">${escapeHtml(r)}</li>`).join('')}
            </ul>
        </div>
        ` : ''}

        <div style="margin-top: 40px; text-align: center;">
            <button class="btn btn-submit" onclick="downloadReport()" style="padding: 15px 30px; font-size: 16px;">
                📥 Скачать отчет
            </button>
        </div>
    `;
}

// Скачивание отчета
function downloadReport() {
    const report = {
        taskHistory: interviewState.taskHistory,
        chatHistory: interviewState.chatHistory,
        metrics: interviewState.metrics,
        generatedAt: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `interview-report-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

// Смена языка
function changeLanguage() {
    const select = document.getElementById('language-select');
    const language = select.value;
    if (interviewState.editor) {
        monaco.editor.setModelLanguage(interviewState.editor.getModel(), language);
    }
}

// Визуализация этапов
function formatDuration(ms) {
    if (typeof ms !== 'number' || isNaN(ms)) {
        return '—';
    }
    const seconds = (ms / 1000).toFixed(1);
    return `${seconds}s`;
}

function setStageDuration(stageNumber, durationMs) {
    const durationEl = document.getElementById(`stage-${stageNumber}-time`);
    if (!durationEl) return;
    if (durationMs === null || durationMs === undefined) {
        durationEl.textContent = '—';
        return;
    }
    durationEl.textContent = formatDuration(durationMs);
    interviewState.stageDurations[stageNumber] = durationMs;
}

function updateStage(stageNumber, status, durationMs = null) {
    const stage = document.getElementById(`stage-${stageNumber}`);
    const icon = stage.querySelector('.stage-icon');
    
    stage.className = `stage-item ${status}`;
    icon.className = `stage-icon ${status}`;
    
    if (status === 'completed') {
        icon.textContent = '✓';
    } else if (status === 'active') {
        setStageDuration(stageNumber, null);
        icon.textContent = stageNumber;
    } else {
        setStageDuration(stageNumber, null);
        icon.textContent = stageNumber;
    }

    if (durationMs !== null) {
        setStageDuration(stageNumber, durationMs);
    }
}

function updateProgress(percentage) {
    const progressBar = document.getElementById('progress-bar');
    progressBar.style.width = `${percentage}%`;
}

function showNotification(message, type = 'info') {
    const notification = document.getElementById('status-notification');
    const icon = document.getElementById('status-icon');
    const messageEl = document.getElementById('status-message');
    
    notification.className = `status-notification ${type} show`;
    messageEl.textContent = message;
    
    const icons = {
        success: '✅',
        error: '❌',
        info: 'ℹ️',
        warning: '⚠️'
    };
    
    icon.textContent = icons[type] || icons.info;
    
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

// Утилиты
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showLoading(message) {
    const container = document.getElementById('task-view');
    container.innerHTML = `<div class="loading">${message}</div>`;
}

function showError(message) {
    const container = document.getElementById('task-view');
    container.innerHTML = `<div class="loading" style="color: #ce9178;">❌ ${message}</div>`;
    showNotification(message, 'error');
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

