// Metrics and timer management module
import { interviewState } from './state.js';
import { refreshCandidateInsights } from './ui-utils.js';

export function pauseTimer() {
    if (!interviewState.metrics.lastPauseStart) {
        interviewState.metrics.lastPauseStart = Date.now();
    }
}

export function resumeTimer() {
    if (interviewState.metrics.lastPauseStart) {
        const pauseDuration = Date.now() - interviewState.metrics.lastPauseStart;
        interviewState.metrics.pausedTime += pauseDuration;
        interviewState.metrics.lastPauseStart = null;
    }
}

export async function withLLM(operation) {
    pauseTimer();
    const start = performance.now();
    try {
        const result = await operation();
        return { result, duration: performance.now() - start };
    } finally {
        resumeTimer();
    }
}

export function updateMetrics() {
    const tasksCountEl = document.getElementById('tasks-count');
    const overallScoreEl = document.getElementById('overall-score');
    const timeSpentEl = document.getElementById('time-spent');
    
    if (tasksCountEl) {
        tasksCountEl.textContent = interviewState.metrics.tasksCount;
    }
    if (overallScoreEl) {
        overallScoreEl.textContent = interviewState.metrics.overallScore;
    }
    
    if (timeSpentEl && interviewState.metrics.startTime) {
        // Calculate active time (total time minus paused time)
        const totalElapsed = Date.now() - interviewState.metrics.startTime;
        const currentPause = interviewState.metrics.lastPauseStart ? 
            (Date.now() - interviewState.metrics.lastPauseStart) : 0;
        const activeTime = totalElapsed - interviewState.metrics.pausedTime - currentPause;
        interviewState.metrics.timeSpent = activeTime;
        
        const elapsed = Math.floor(activeTime / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        timeSpentEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    refreshCandidateInsights();
}

export function calculateAverageScore() {
    if (interviewState.taskHistory.length === 0) return 0;
    const sum = interviewState.taskHistory.reduce((acc, t) => acc + (t.score || 0), 0);
    return Math.round(sum / interviewState.taskHistory.length);
}

export function startTimer() {
    if (interviewState.timerInterval) {
        clearInterval(interviewState.timerInterval);
    }
    interviewState.timerInterval = setInterval(updateMetrics, 1000);
    updateMetrics();
}

export function stopTimer() {
    if (interviewState.timerInterval) {
        clearInterval(interviewState.timerInterval);
        interviewState.timerInterval = null;
    }
}

