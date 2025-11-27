// Task rendering module
import { interviewState } from './state.js';
import { escapeHtml, refreshCandidateInsights } from './ui-utils.js';

export function displayTask(task) {
    const container = document.getElementById('task-view');
    const taskLevelEl = document.getElementById('task-level');
    
    if (!container) return;
    if (taskLevelEl) {
        taskLevelEl.textContent = task.level;
    }
    
    let html = `
        <div class="task-title">Задача ${interviewState.metrics.tasksCount + 1}</div>
    `;

    if (task.task) {
        html += `<div class="task-description">${escapeHtml(task.task)}</div>`;
    } else if (task.description) {
        html += `<div class="task-description">${escapeHtml(task.description)}</div>`;
    }

    if (task.requirements && task.requirements.length > 0) {
        html += '<div style="margin-top: 20px;"><h3 style="color: #4ec9b0; margin-bottom: 10px; font-size: 16px;">Требования:</h3><ul style="margin-left: 20px; line-height: 1.8;">';
        task.requirements.forEach(req => {
            html += `<li style="margin: 10px 0; padding-left: 5px;">${escapeHtml(req)}</li>`;
        });
        html += '</ul></div>';
    }

    if (task.example) {
        html += `
            <div class="task-examples" style="margin-top: 20px;">
                <h3 style="color: #4ec9b0; margin-bottom: 15px; font-size: 16px;">Пример:</h3>
                <div class="example">
                    <div class="code-block">${escapeHtml(task.example)}</div>
                </div>
            </div>
        `;
    } else if (task.examples && task.examples.length > 0) {
        html += '<div class="task-examples" style="margin-top: 20px;"><h3 style="color: #4ec9b0; margin-bottom: 15px; font-size: 16px;">Примеры:</h3>';
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
                <h3 style="color: #4ec9b0; margin-bottom: 10px; font-size: 16px;">Подсказка:</h3>
                <div style="line-height: 1.6;">${escapeHtml(task.hint)}</div>
            </div>
        `;
    } else if (task.hints && task.hints.length > 0) {
        html += '<div style="margin-top: 20px;"><h3 style="color: #4ec9b0; margin-bottom: 10px; font-size: 16px;">Подсказки:</h3><ul style="margin-left: 20px;">';
        task.hints.forEach(hint => {
            html += `<li style="margin: 8px 0; line-height: 1.6;">${escapeHtml(hint)}</li>`;
        });
        html += '</ul></div>';
    }

    if (task.constraints && task.constraints.length > 0) {
        html += '<div style="margin-top: 20px;"><h3 style="color: #4ec9b0; margin-bottom: 10px; font-size: 16px;">Ограничения:</h3><ul style="margin-left: 20px; line-height: 1.8;">';
        task.constraints.forEach(constraint => {
            html += `<li style="margin: 10px 0; padding-left: 5px;">${escapeHtml(constraint)}</li>`;
        });
        html += '</ul></div>';
    }

    if (task.starterCode) {
        html += `
            <div style="margin-top: 20px;">
                <h3 style="color: #4ec9b0; margin-bottom: 10px; font-size: 16px;">Шаблон кода:</h3>
                <div class="code-block" style="white-space: pre-wrap; font-family: 'Courier New', monospace;">${escapeHtml(task.starterCode)}</div>
            </div>
        `;
    }

    container.innerHTML = html;

    // If task has visible test cases, prefill runtime input
    try {
        const runtimeInput = document.getElementById('runtime-input');
        if (runtimeInput && Array.isArray(task.visibleTestCases) && task.visibleTestCases.length > 0) {
            const firstCase = task.visibleTestCases[0];
            if (firstCase && typeof firstCase.input === 'string') {
                runtimeInput.value = firstCase.input;
            }
        }
    } catch (e) {
        console.error('Failed to prefill runtime input from visibleTestCases', e);
    }
}

export function displayTestResults(results) {
    const container = document.getElementById('task-view');
    if (!container) return;

    if (results && results.message) {
        container.innerHTML += `<div class="test-results">${escapeHtml(results.message)}</div>`;
        return;
    }

    let testHtml = '<div class="test-results"><h3 style="color: #4ec9b0; margin-bottom: 15px;">Результаты тестов:</h3>';

    // Видимые тесты
    if (results.visible && results.visible.length) {
        testHtml += '<div style="margin-bottom: 20px;"><h4 style="color: #858585; font-size: 14px; margin-bottom: 10px; font-weight: normal;">Видимые тесты:</h4>';
        results.visible.forEach((test, i) => {
            const icon = test.passed ? '✓' : '✗';
            testHtml += `
                <div class="test-item" style="display: flex; align-items: flex-start; margin-bottom: 12px; padding: 10px; background: ${test.passed ? 'rgba(78, 201, 176, 0.1)' : 'rgba(206, 145, 120, 0.1)'}; border-radius: 4px; border-left: 3px solid ${test.passed ? '#4ec9b0' : '#ce9178'};">
                    <div class="test-icon ${test.passed ? 'passed' : 'failed'}" style="font-size: 20px; font-weight: bold; margin-right: 12px; min-width: 24px; text-align: center; color: ${test.passed ? '#4ec9b0' : '#ce9178'};">
                        ${icon}
                    </div>
                    <div style="flex: 1;">
                        <div style="font-weight: 500; margin-bottom: 4px;">Тест ${i + 1}: ${test.passed ? '<span style="color: #4ec9b0;">Пройден</span>' : '<span style="color: #ce9178;">Не пройден</span>'}</div>
                        ${typeof test.executionTime === 'number' ? `<div class="test-meta" style="color: #858585; font-size: 12px; margin-top: 4px;">Время: ${(test.executionTime / 1000).toFixed(2)} c</div>` : ''}
                        ${test.actual ? `<div class="test-meta" style="color: #858585; font-size: 12px; margin-top: 4px;">Вывод: ${escapeHtml(test.actual)}</div>` : ''}
                        ${test.error ? `<div style="color: #ce9178; font-size: 12px; margin-top: 4px; padding: 6px; background: rgba(206, 145, 120, 0.1); border-radius: 3px;">${escapeHtml(test.error)}</div>` : ''}
                    </div>
                </div>
            `;
        });
        testHtml += '</div>';
    } else {
        testHtml += '<div class="test-meta" style="color: #858585; margin-bottom: 20px;">Видимые тесты отсутствуют.</div>';
    }

    // Скрытые тесты (показываем только если они есть и если видимые тесты прошли)
    const hasVisiblePassed = results.visible && results.visible.length > 0 && results.visible.every(t => t.passed);
    const hasHiddenTests = results.hidden && results.hidden.length > 0;
    
    if (hasHiddenTests) {
        const allHiddenPassed = results.hidden.every(t => t.passed);
        const showHidden = hasVisiblePassed || !allHiddenPassed; // Показываем если видимые прошли или скрытые упали
        
        if (showHidden) {
            testHtml += '<div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #3e3e42;"><h4 style="color: #858585; font-size: 14px; margin-bottom: 10px; font-weight: normal;">Скрытые тесты:</h4>';
            results.hidden.forEach((test, i) => {
                const icon = test.passed ? '✓' : '✗';
                testHtml += `
                    <div class="test-item" style="display: flex; align-items: flex-start; margin-bottom: 12px; padding: 10px; background: ${test.passed ? 'rgba(78, 201, 176, 0.1)' : 'rgba(206, 145, 120, 0.1)'}; border-radius: 4px; border-left: 3px solid ${test.passed ? '#4ec9b0' : '#ce9178'};">
                        <div class="test-icon ${test.passed ? 'passed' : 'failed'}" style="font-size: 20px; font-weight: bold; margin-right: 12px; min-width: 24px; text-align: center; color: ${test.passed ? '#4ec9b0' : '#ce9178'};">
                            ${icon}
                        </div>
                        <div style="flex: 1;">
                            <div style="font-weight: 500; margin-bottom: 4px;">Скрытый тест ${i + 1}: ${test.passed ? '<span style="color: #4ec9b0;">Пройден</span>' : '<span style="color: #ce9178;">Не пройден</span>'}</div>
                            ${typeof test.executionTime === 'number' ? `<div class="test-meta" style="color: #858585; font-size: 12px; margin-top: 4px;">Время: ${(test.executionTime / 1000).toFixed(2)} c</div>` : ''}
                            ${test.actual ? `<div class="test-meta" style="color: #858585; font-size: 12px; margin-top: 4px;">Вывод: ${escapeHtml(test.actual)}</div>` : ''}
                            ${test.error ? `<div style="color: #ce9178; font-size: 12px; margin-top: 4px; padding: 6px; background: rgba(206, 145, 120, 0.1); border-radius: 3px;">${escapeHtml(test.error)}</div>` : ''}
                            ${test.expected ? `<div class="test-meta" style="color: #858585; font-size: 12px; margin-top: 4px;">Ожидалось: ${escapeHtml(test.expected)}</div>` : ''}
                        </div>
                    </div>
                `;
            });
            testHtml += '</div>';
        }
    }

    // Общая статистика
    const totalVisible = results.visible ? results.visible.length : 0;
    const passedVisible = results.visible ? results.visible.filter(t => t.passed).length : 0;
    const totalHidden = results.hidden ? results.hidden.length : 0;
    const passedHidden = results.hidden ? results.hidden.filter(t => t.passed).length : 0;
    const totalTests = totalVisible + totalHidden;
    const totalPassed = passedVisible + passedHidden;

    interviewState.metrics = interviewState.metrics || {};
    interviewState.metrics.testSummary = {
        total: totalTests,
        passed: totalPassed,
        visiblePassed,
        visibleTotal: totalVisible,
        hiddenPassed,
        hiddenTotal: totalHidden
    };
    interviewState.metrics.lastTestRunAt = Date.now();
    refreshCandidateInsights();
    
    if (totalTests > 0) {
        testHtml += `
            <div style="margin-top: 20px; padding: 15px; background: rgba(78, 201, 176, 0.1); border-radius: 4px; border-left: 4px solid #4ec9b0;">
                <div style="font-weight: 500; color: #4ec9b0; margin-bottom: 8px;">Общая статистика:</div>
                <div style="color: #858585; font-size: 13px; line-height: 1.8;">
                    Пройдено тестов: ${totalPassed} из ${totalTests} (${Math.round(totalPassed / totalTests * 100)}%)<br>
                    Видимые: ${passedVisible}/${totalVisible} ${totalVisible > 0 ? `(${Math.round(passedVisible / totalVisible * 100)}%)` : ''}<br>
                    ${totalHidden > 0 ? `Скрытые: ${passedHidden}/${totalHidden} ${totalHidden > 0 ? `(${Math.round(passedHidden / totalHidden * 100)}%)` : ''}` : ''}
                </div>
            </div>
        `;
    }

    testHtml += '</div>';
    
    // Append results to task
    const existing = container.innerHTML;
    container.innerHTML = existing + testHtml;
}

