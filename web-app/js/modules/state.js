// State management module
const CANDIDATE_HISTORY_KEY = 'ai-interviewer:candidate-history';

function getStorageSafe() {
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            return window.localStorage;
        }
    } catch {
        return null;
    }
    return null;
}

function loadCandidateHistory() {
    const storage = getStorageSafe();
    if (!storage) return [];
    try {
        const raw = storage.getItem(CANDIDATE_HISTORY_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        if (Array.isArray(parsed)) {
            return parsed;
        }
        return [];
    } catch {
        return [];
    }
}

function persistCandidateHistory(history) {
    const storage = getStorageSafe();
    if (!storage) return;
    try {
        storage.setItem(CANDIDATE_HISTORY_KEY, JSON.stringify(history.slice(-10)));
    } catch {
        // ignore write errors (private mode, etc.)
    }
}

export function addCandidateHistoryEntry(entry) {
    if (!entry || typeof entry !== 'object') return;
    const history = interviewState.candidateHistory || [];
    history.push({
        score: Number(entry.score) || 0,
        technical: Number(entry.technical) || 0,
        communication: Number(entry.communication) || 0,
        tasks: Number(entry.tasks) || 0,
        generatedAt: entry.generatedAt || new Date().toISOString()
    });
    interviewState.candidateHistory = history.slice(-10);
    persistCandidateHistory(interviewState.candidateHistory);
}

export let interviewState = {
    currentLevel: null,
    currentTask: null,
    taskHistory: [],
    chatHistory: [],
    evaluationHistory: [],
    currentTaskAttempts: 0,
    maxAttemptsPerTask: 2,
    metrics: {
        tasksCount: 0,
        overallScore: 0,
        timeSpent: 0,
        startTime: null,
        pausedTime: 0,
        lastPauseStart: null,
        hintsUsed: 0,
        testSummary: {
            total: 0,
            passed: 0,
            visiblePassed: 0,
            visibleTotal: 0,
            hiddenPassed: 0,
            hiddenTotal: 0
        }
    },
    hintUsageByTask: {},
    hintLimitPerTask: 2,
    currentTaskHintCount: 0,
    activeQuestion: null,
    stage: 'level-selection',
    stageDurations: {},
    editor: null,
    timerInterval: null,
    antiCheatEnabled: true,
    antiCheatEvents: [],
    additionalQuestionsCount: 0,
    maxAdditionalQuestions: 3,
    candidateHistory: loadCandidateHistory()
};

export const adminDefaults = {
    tasks: [
        {
            id: 'ALG-101',
            title: 'Сумма массива',
            description: 'Прочитайте из стандартного ввода числа через пробел и выведите сумму всех элементов.',
            level: 'Junior',
            topic: 'algorithms',
            updated: '2025-11-26',
            visibility: 'public',
            tags: ['arrays', 'math'],
            visibleTestCases: [
                { input: '1 2 3 4\n', output: '10' },
                { input: '10 -5 7\n', output: '12' }
            ],
            hiddenTestCases: [
                { input: '100 200 300\n', output: '600' },
                { input: '0 0 0 0 0\n', output: '0' }
            ]
        },
        {
            id: 'DSN-204',
            title: 'Кеширование новостной ленты',
            description: 'Спроектируйте сервис кеширования ленты новостей для миллионов пользователей.',
            level: 'Middle',
            topic: 'system-design',
            updated: '2025-11-25',
            visibility: 'private',
            tags: ['cache', 'architecture']
        },
        {
            id: 'DB-310',
            title: 'Нормализация схемы',
            description: 'Приведите схему БД к 3НФ, сохранив целостность данных.',
            level: 'Senior',
            topic: 'databases',
            updated: '2025-11-18',
            visibility: 'public',
            tags: ['sql', 'normalization']
        },
        {
            id: 'ALG-155',
            title: 'Баланс скобок',
            description: 'Получите строку со скобками и выведите YES, если последовательность корректна, иначе NO.',
            level: 'Junior',
            topic: 'algorithms',
            updated: '2025-11-26',
            visibility: 'public',
            tags: ['stack', 'strings'],
            visibleTestCases: [
                { input: '()[]{}\n', output: 'YES' },
                { input: '([)]\n', output: 'NO' }
            ],
            hiddenTestCases: [
                { input: '(((())))\n', output: 'YES' },
                { input: '((())\n', output: 'NO' }
            ]
        }
    ],
    sessions: [
        { id: 'INT-8721', candidate: 'Иван Петров', level: 'Junior', status: 'active', progress: 65, started: '10:24', timeSpent: '18 мин' },
        { id: 'INT-8722', candidate: 'Мария Смирнова', level: 'Middle', status: 'awaiting', progress: 5, started: '10:40', timeSpent: '-' },
        { id: 'INT-8723', candidate: 'Дмитрий Орлов', level: 'Senior', status: 'active', progress: 32, started: '10:05', timeSpent: '41 мин' }
    ],
    candidates: [
        { id: 'CND-001', name: 'Иван Петров', level: 'Junior', overall: 78, technical: 80, communication: 72, attempts: 1, time: '38 мин', status: 'review' },
        { id: 'CND-002', name: 'Мария Смирнова', level: 'Middle', overall: 86, technical: 90, communication: 80, attempts: 1, time: '42 мин', status: 'approved' },
        { id: 'CND-003', name: 'Дмитрий Орлов', level: 'Senior', overall: 61, technical: 58, communication: 65, attempts: 2, time: '55 мин', status: 'review' },
        { id: 'CND-004', name: 'Сергей Соколов', level: 'Middle', overall: 49, technical: 45, communication: 52, attempts: 2, time: '60 мин', status: 'rejected' }
    ],
    settings: {
        duration: 45,
        maxTasks: 2,
        model: 'qwen3-coder-30b-a3b-instruct-fp8',
        temperature: 0.2,
        metrics: {
            technical: true,
            communication: true,
            readability: true
        },
        antiCheat: {
            enabled: true,
            clipboard: true,
            devtools: true,
            extensions: false
        }
    },
    stats: {
        totalInterviews: 143,
        avgScore: 74,
        approvalRate: 32
    },
    reports: [],
    antiCheatEvents: []
};

export const adminState = {
    filters: {
        level: 'all',
        topic: 'all',
        search: ''
    },
    tasks: [],
    sessions: [],
    candidates: [],
    settings: null,
    stats: null,
    reports: [],
    antiCheatEvents: [],
    loading: false,
    error: null,
    lastSync: null,
    taskFormMode: 'create',
    editingTaskId: null
};

