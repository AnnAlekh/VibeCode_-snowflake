let editor;
let interviewState = {
    currentLevel: null,
    currentTask: null,
    taskHistory: [],
    chatHistory: [],
    metrics: {
        tasksCount: 0,
        overallScore: 0,
        timeSpent: 0,
        startTime: null
    },
    stage: 'level-selection' // level-selection, interview, report
};

// Инициализация Monaco Editor
function initMonacoEditor() {
    if (typeof monaco !== 'undefined') {
        editor = monaco.editor.create(document.getElementById('monaco-editor'), {
            value: '# Напишите ваше решение здесь\n\ndef solution(arr):\n    pass\n',
            language: 'python',
            theme: 'vs-dark',
            fontSize: 14,
            minimap: { enabled: false },
            automaticLayout: true
        });
    } else {
        setTimeout(initMonacoEditor, 100);
    }
}

window.initMonaco = initMonacoEditor;
window.addEventListener('DOMContentLoaded', () => {
    if (window.monacoReady) {
        initMonacoEditor();
    }
});

// Начало интервью
async function startInterview(level) {
    interviewState.currentLevel = level;
    interviewState.stage = 'interview';
    interviewState.metrics.startTime = Date.now();

    document.getElementById('level-selector').classList.add('hidden');
    document.getElementById('interview-screen').classList.remove('hidden');

    updateMetrics();

    // Генерация первой задачи
    await generateFirstTask(level);
}

// Генерация первой задачи
async function generateFirstTask(level) {
    try {
        const task = await InterviewService.generateTask({
            level: level,
            topic: 'arrays',
            language: 'python'
        });

        interviewState.currentTask = task;
        displayTask(task);
        addChatMessage('assistant', 'Привет! Я ваш интервьюер. Давайте начнем с первой задачи. Прочитайте условие и напишите решение.');
    } catch (error) {
        console.error('Error generating task:', error);
        addChatMessage('assistant', 'Ошибка при генерации задачи. Попробуйте еще раз.');
    }
}

// Отображение задачи
function displayTask(task) {
    document.getElementById('task-title').textContent = `Задача ${interviewState.metrics.tasksCount + 1}: ${task.level} уровень`;
    document.getElementById('task-description').textContent = task.description;

    // Примеры
    const examplesContainer = document.getElementById('task-examples');
    examplesContainer.innerHTML = '<h3 style="margin-bottom: 10px; color: #4ec9b0;">Примеры:</h3>';
    
    task.examples.forEach((example, i) => {
        const exampleDiv = document.createElement('div');
        exampleDiv.className = 'example';
        exampleDiv.innerHTML = `
            <div class="example-title">Пример ${i + 1}:</div>
            <div class="code-block">Вход: ${example.input}</div>
            <div class="code-block">Выход: ${example.output}</div>
            ${example.explanation ? `<div style="margin-top: 5px; color: #858585;">${example.explanation}</div>` : ''}
        `;
        examplesContainer.appendChild(exampleDiv);
    });

    // Очистка результатов тестов
    document.getElementById('test-results').innerHTML = '';
}

// Запуск кода
async function runCode() {
    const code = editor.getValue();
    if (!code.trim()) {
        alert('Напишите код перед запуском!');
        return;
    }

    try {
        const results = await InterviewService.runTests({
            code: code,
            task: interviewState.currentTask,
            language: 'python'
        });

        displayTestResults(results);
    } catch (error) {
        console.error('Error running tests:', error);
        alert('Ошибка при запуске тестов');
    }
}

// Отображение результатов тестов
function displayTestResults(results) {
    const container = document.getElementById('test-results');
    container.innerHTML = '<h3 style="margin-bottom: 10px; color: #4ec9b0;">Результаты тестов:</h3>';

    results.visible.forEach((test, i) => {
        const testDiv = document.createElement('div');
        testDiv.className = 'test-item';
        testDiv.innerHTML = `
            <div class="test-icon ${test.passed ? 'passed' : 'failed'}">${test.passed ? '✓' : '✗'}</div>
            <div>
                <div>Тест ${i + 1}: ${test.passed ? 'Пройден' : 'Не пройден'}</div>
                ${test.error ? `<div style="color: #ce9178; font-size: 12px; margin-top: 3px;">${test.error}</div>` : ''}
            </div>
        `;
        container.appendChild(testDiv);
    });
}

// Отправка решения
async function submitSolution() {
    const code = editor.getValue();
    
    try {
        // Запуск тестов
        const testResults = await InterviewService.runTests({ 
            code, 
            task: interviewState.currentTask, 
            language: 'python' 
        });

        // Если видимые тесты прошли, но скрытые упали - анализируем ошибку
        if (testResults.visible.every(t => t.passed) && !testResults.hidden.every(t => t.passed)) {
            const errorAnalysis = await InterviewService.analyzeError({
                code: code,
                task: interviewState.currentTask,
                failedTests: testResults.hidden.filter(t => !t.passed),
                visiblePassed: true
            });

            addChatMessage('assistant', `🔍 Анализ ошибки:\n\n${errorAnalysis.explanation}\n\n💡 Подсказка: ${errorAnalysis.suggestedFix}`);
            return;
        }

        // Анализ решения
        const analysis = await InterviewService.analyzeSolution({
            code: code,
            task: interviewState.currentTask,
            testResults: testResults
        });

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

        // Если это первая задача, задаем вопрос
        if (interviewState.metrics.tasksCount === 1) {
            await askFollowUpQuestion(analysis);
        } else {
            // Если вторая задача решена, показываем демо античита и переходим к финальному диалогу
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
        addChatMessage('system', `[Система защиты] ${msg}`, 'warning');
    }

    addChatMessage('assistant', 'Система защиты отслеживает различные подозрительные действия для обеспечения честности интервью.');
}

// Вопрос после первой задачи
async function askFollowUpQuestion(analysis) {
    const question = await InterviewService.generateQuestion({
        task: interviewState.currentTask,
        solution: editor.getValue(),
        analysis: analysis
    });

    addChatMessage('assistant', question);
}

// Обработка ответа кандидата
async function handleCandidateAnswer(answer) {
    addChatMessage('user', answer);

    // Оценка ответа
    const evaluation = await InterviewService.evaluateAnswer({
        question: interviewState.chatHistory[interviewState.chatHistory.length - 2].content,
        answer: answer,
        solution: editor.getValue()
    });

    // Генерация следующей задачи
    await generateNextTask(evaluation);
}

// Генерация следующей задачи
async function generateNextTask(evaluation) {
    addChatMessage('assistant', 'Отлично! Теперь давайте перейдем к более сложной задаче. Генерирую задачу...');

    const nextLevel = determineNextLevel(evaluation);
    
    // Streaming генерация
    const taskContainer = document.getElementById('task-description');
    taskContainer.innerHTML = '<span class="streaming-text">Генерация задачи...</span>';

    const task = await InterviewService.generateTaskStream({
        level: nextLevel,
        topic: 'algorithms',
        language: 'python',
        previousTask: interviewState.currentTask,
        candidatePerformance: evaluation
    }, (chunk, accumulated) => {
        // Real-time отображение
        taskContainer.innerHTML = `<span class="streaming-text">${accumulated}</span>`;
    });

    interviewState.currentTask = task;
    displayTask(task);
    addChatMessage('assistant', 'Задача сгенерирована! Приступайте к решению.');
}

// Определение следующего уровня
function determineNextLevel(evaluation) {
    if (evaluation.score >= 85) {
        return 'Middle';
    } else if (evaluation.score >= 70) {
        return 'Junior+';
    }
    return 'Junior';
}

// Финальный диалог
async function startFinalDialogue() {
    const question = await InterviewService.generateFinalQuestion({
        taskHistory: interviewState.taskHistory,
        metrics: interviewState.metrics
    });

    addChatMessage('assistant', question);
}

// Отправка сообщения в чат
async function sendMessage() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();
    
    if (!message) return;

    addChatMessage('user', message);
    input.value = '';

    // Обработка ответа
    if (interviewState.metrics.tasksCount === 1 && interviewState.chatHistory.length === 2) {
        // Ответ на вопрос после первой задачи
        await handleCandidateAnswer(message);
    } else if (interviewState.metrics.tasksCount === 2) {
        // Финальный диалог
        const response = await InterviewService.generateDialogueResponse({
            question: interviewState.chatHistory[interviewState.chatHistory.length - 2].content,
            answer: message,
            context: {
                tasks: interviewState.taskHistory,
                metrics: interviewState.metrics
            }
        });
        addChatMessage('assistant', response);

        // После нескольких обменов показываем отчет
        if (interviewState.chatHistory.length >= 6) {
            setTimeout(() => showFinalReport(), 2000);
        }
    }
}

// Обработка нажатия Enter в чате
function handleChatKeyPress(event) {
    if (event.key === 'Enter') {
        sendMessage();
    }
}

// Добавление сообщения в чат
function addChatMessage(role, content, type = 'normal') {
    const messagesContainer = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    
    if (type === 'warning') {
        messageDiv.style.opacity = '0.8';
    }
    
    const time = new Date().toLocaleTimeString();
    messageDiv.innerHTML = `
        <div class="message-bubble">${content}</div>
        <div class="message-time">${time}</div>
    `;
    
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    // Сохранение в историю
    interviewState.chatHistory.push({ role, content, time, type });
}

// Обновление метрик
function updateMetrics() {
    document.getElementById('tasks-count').textContent = interviewState.metrics.tasksCount;
    document.getElementById('overall-score').textContent = interviewState.metrics.overallScore;
    
    if (interviewState.metrics.startTime) {
        const elapsed = Math.floor((Date.now() - interviewState.metrics.startTime) / 1000);
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
    const report = await InterviewService.generateReport({
        taskHistory: interviewState.taskHistory,
        chatHistory: interviewState.chatHistory,
        metrics: interviewState.metrics
    });

    document.getElementById('interview-screen').classList.add('hidden');
    document.getElementById('report-screen').classList.remove('hidden');

    displayReport(report);
}

// Отображение отчета
function displayReport(report) {
    const container = document.getElementById('report-content');
    container.innerHTML = `
        <h1 style="color: #4ec9b0; margin-bottom: 30px;">Финальный отчет</h1>
        
        <div class="report-section">
            <h2>Общая статистика</h2>
            <p>Выполнено задач: ${report.summary.totalTasks}</p>
            <p>Общая оценка: ${report.scores.overall}/100</p>
            <p>Техническая оценка: ${report.scores.technical}/100</p>
            <p>Коммуникативная оценка: ${report.scores.communication}/100</p>
        </div>

        <div class="report-section">
            <h2>Сильные стороны</h2>
            <ul class="strengths-list">
                ${report.strengths.map(s => `<li>${s}</li>`).join('')}
            </ul>
        </div>

        <div class="report-section">
            <h2>Области для улучшения</h2>
            <ul class="weaknesses-list">
                ${report.weaknesses.map(w => `<li>${w}</li>`).join('')}
            </ul>
        </div>

        <div class="report-section">
            <h2>Детальный анализ</h2>
            <p style="line-height: 1.6;">${report.detailedAnalysis}</p>
        </div>

        <div style="margin-top: 30px; text-align: center;">
            <button class="btn btn-primary" onclick="downloadReport()" style="padding: 12px 24px; font-size: 16px;">
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
        metrics: interviewState.metrics
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `interview-report-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

// Обновление времени каждую секунду
setInterval(updateMetrics, 1000);

