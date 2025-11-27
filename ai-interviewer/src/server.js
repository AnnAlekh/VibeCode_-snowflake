import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import TaskGenerator from './llm/task-generator.js';
import SolutionAnalyzer from './llm/solution-analyzer.js';
import LevelAssessor from './core/level-assessor.js';
import AdaptiveTaskSelector from './core/adaptive-selector.js';
import ReportGenerator from './llm/report-generator.js';
import { runCodeInSandbox } from './runtime/code-executor.js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

const apiKey = process.env.QWEN_API_KEY || process.env.OPENAI_API_KEY;

if (!apiKey) {
  console.error('❌ ОШИБКА: API ключ не найден!');
  console.error('Создайте файл .env и добавьте QWEN_API_KEY или OPENAI_API_KEY');
  process.exit(1);
}

let taskGenerator, solutionAnalyzer, levelAssessor, adaptiveSelector, reportGenerator;

try {
  taskGenerator = new TaskGenerator(apiKey);
  solutionAnalyzer = new SolutionAnalyzer(apiKey);
  levelAssessor = new LevelAssessor(apiKey);
  adaptiveSelector = new AdaptiveTaskSelector(apiKey);
  reportGenerator = new ReportGenerator(apiKey);
  console.log('✅ Все модули инициализированы');
} catch (error) {
  console.error('❌ Ошибка при инициализации модулей:', error.message);
  console.error(error.stack);
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, 'data');
const adminDataPath = path.join(dataDir, 'admin-data.json');

const seedAdminData = () => ({
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
      clipboard: true,
      devtools: true,
      extensions: false
    }
  },
  tasks: [],
  sessions: [],
  candidates: [],
  stats: {
    totalInterviews: 0,
    avgScore: 0,
    approvalRate: 0
  },
  reports: [],
  antiCheatEvents: []
});

const loadAdminData = () => {
  try {
    if (!fs.existsSync(adminDataPath)) {
      fs.mkdirSync(dataDir, { recursive: true });
      const seeded = seedAdminData();
      fs.writeFileSync(adminDataPath, JSON.stringify(seeded, null, 2));
      return seeded;
    }
    const raw = fs.readFileSync(adminDataPath, 'utf-8');
    return JSON.parse(raw);
  } catch (error) {
    console.error('Failed to load admin data, using defaults:', error);
    return seedAdminData();
  }
};

const persistAdminData = (data) => {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(adminDataPath, JSON.stringify(data, null, 2));
};

let adminData = loadAdminData();
adminData.tasks = adminData.tasks || [];
adminData.sessions = adminData.sessions || [];
adminData.candidates = adminData.candidates || [];
adminData.stats = adminData.stats || { totalInterviews: 0, avgScore: 0, approvalRate: 0 };
adminData.reports = adminData.reports || [];
adminData.antiCheatEvents = adminData.antiCheatEvents || [];

const generateTaskId = (level = 'JR') => {
  const prefix = (level || 'GEN').slice(0, 3).toUpperCase();
  return `${prefix}-${Math.floor(100 + Math.random() * 900)}`;
};

const mergeNested = (existing = {}, incoming = {}) => ({
  ...existing,
  ...Object.entries(incoming || {}).reduce((acc, [key, value]) => {
    if (typeof value === 'object' && !Array.isArray(value)) {
      acc[key] = mergeNested(existing[key] || {}, value);
    } else {
      acc[key] = value;
    }
    return acc;
  }, {})
});

const MAX_ANTI_CHEAT_EVENTS = 200;

const sanitizeInput = value => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
};

const parseExampleToCase = example => {
  if (!example) return null;
  if (typeof example === 'object') {
    if (example.input !== undefined || example.output !== undefined) {
      return {
        input: sanitizeInput(example.input),
        output: example.output !== undefined ? String(example.output).trim() : ''
      };
    }
    if (example.example) {
      return parseExampleToCase(example.example);
    }
  }
  if (typeof example === 'string') {
    const inputMatch = example.match(/Вход[:\-]?\s*([^\n]+)/i);
    const outputMatch = example.match(/Выход[:\-]?\s*([^\n]+)/i);
    if (inputMatch && outputMatch) {
      return {
        input: inputMatch[1].trim(),
        output: outputMatch[1].trim()
      };
    }
  }
  return null;
};

const buildTestSuites = (task = {}) => {
  const visibleFromTask = Array.isArray(task.visibleTestCases) ? task.visibleTestCases : [];
  const hiddenFromTask = Array.isArray(task.hiddenTestCases) ? task.hiddenTestCases : [];

  const derivedFromExamples = Array.isArray(task.examples)
    ? task.examples.map(parseExampleToCase).filter(Boolean)
    : (task.example ? [parseExampleToCase(task.example)].filter(Boolean) : []);

  const visible = visibleFromTask.length ? visibleFromTask : derivedFromExamples;
  const hidden = hiddenFromTask.length ? hiddenFromTask : visible.slice(0, 1);

  return {
    visible: visible.map(test => ({
      input: sanitizeInput(test.input),
      output: test.output !== undefined && test.output !== null ? String(test.output).trim() : ''
    })),
    hidden: hidden.map(test => ({
      input: sanitizeInput(test.input),
      output: test.output !== undefined && test.output !== null ? String(test.output).trim() : ''
    }))
  };
};

const runTestSuite = async (testCases, { code, language }) => {
  const results = [];
  let totalTime = 0;

  for (const testCase of testCases) {
    try {
      const execResult = await runCodeInSandbox({
        language,
        code,
        input: sanitizeInput(testCase.input),
        timeoutMs: testCase.timeoutMs || 5000
      });

      const expected = testCase.output ? testCase.output.trim() : null;
      const actual = execResult.stdout.trim();
      const passed = expected ? actual === expected : execResult.exitCode === 0 && !execResult.timedOut;
      totalTime += execResult.executionTime;

      results.push({
        passed,
        input: testCase.input,
        expected,
        actual,
        stderr: execResult.stderr,
        executionTime: execResult.executionTime,
        timedOut: execResult.timedOut,
        exitCode: execResult.exitCode
      });
    } catch (error) {
      results.push({
        passed: false,
        error: error.message
      });
    }
  }

  return {
    cases: results,
    stats: {
      totalTime,
      averageTime: results.length ? totalTime / results.length : 0
    }
  };
};

// Генерация задачи
app.post('/api/tasks/generate', async (req, res) => {
    try {
        const task = await taskGenerator.generateTask(req.body);
        res.json(task);
    } catch (error) {
        console.error('Error generating task:', error);
        res.status(500).json({ error: error.message });
    }
});

// Streaming генерация задачи
app.post('/api/tasks/generate-stream', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
        let fullContent = '';
        
        await taskGenerator.generateTaskStream(req.body, (chunk, accumulated) => {
            fullContent = accumulated;
            res.write(`data: ${JSON.stringify({ chunk, accumulated })}\n\n`);
        });

        // После завершения отправляем финальную задачу
        const task = await taskGenerator.generateTask({
            level: req.body.level,
            topic: req.body.topic,
            language: req.body.language
        });
        
        res.write(`data: ${JSON.stringify({ done: true, task })}\n\n`);
        res.end();
    } catch (error) {
        console.error('Error in streaming:', error);
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        res.end();
    }
});

// Изолированный запуск кода
app.post('/api/runtime/run', async (req, res) => {
  try {
    const { code, language = 'python', input = '', timeoutMs = 5000 } = req.body;
    if (!code) {
      return res.status(400).json({ error: 'Code is required' });
    }

    const result = await runCodeInSandbox({ code, language, input, timeoutMs });
    res.json(result);
  } catch (error) {
    console.error('Error executing code:', error);
    res.status(500).json({ error: error.message });
  }
});

// Запуск тестов
app.post('/api/tests/run', async (req, res) => {
    try {
        const { code, task = {}, language = 'python' } = req.body;

        if (!code) {
          return res.status(400).json({ error: 'Code is required' });
        }

        const { visible, hidden } = buildTestSuites(task);

        if (!visible.length && !hidden.length) {
          return res.json({
            visible: [],
            hidden: [],
            allPassed: false,
            message: 'Для этой задачи не настроены автоматические тесты'
          });
        }

        const visibleResults = await runTestSuite(visible, { code, language });
        const hiddenResults = await runTestSuite(hidden, { code, language });

        const allPassed = visibleResults.cases.every(t => t.passed) &&
          hiddenResults.cases.every(t => t.passed);

        res.json({
          visible: visibleResults.cases,
          hidden: hiddenResults.cases.map(test => ({
            passed: test.passed,
            executionTime: test.executionTime,
            timedOut: test.timedOut
          })),
          performance: {
            totalVisibleTime: visibleResults.stats.totalTime,
            averageVisibleTime: visibleResults.stats.averageTime
          },
          allPassed
        });
    } catch (error) {
        console.error('Error running tests:', error);
        res.status(500).json({ error: error.message });
    }
});

// Анализ решения
app.post('/api/solutions/analyze', async (req, res) => {
    try {
        const analysis = await solutionAnalyzer.analyze({
            code: req.body.code,
            task: req.body.task,
            testResults: req.body.testResults,
            previousAttempts: 0
        });
        res.json(analysis);
    } catch (error) {
        console.error('Error analyzing solution:', error);
        res.status(500).json({ error: error.message });
    }
});

// Анализ ошибки
app.post('/api/solutions/analyze-error', async (req, res) => {
    try {
        const errorAnalysis = await solutionAnalyzer.analyzeError({
            code: req.body.code,
            task: req.body.task,
            failedTests: req.body.failedTests,
            visiblePassed: req.body.visiblePassed
        });
        res.json(errorAnalysis);
    } catch (error) {
        console.error('Error analyzing error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Генерация вопроса
app.post('/api/chat/question', async (req, res) => {
    try {
        // Передаем полную информацию о задаче и анализе для более конкретного вопроса
        const task = req.body.task || {};
        const question = await solutionAnalyzer.generateFollowUpQuestion({
            task: {
                description: task.description || task.task || '',
                requirements: task.requirements || task.constraints || [],
                constraints: task.constraints || [],
                expectedComplexity: task.expectedComplexity || '',
                examples: task.examples || [],
                example: task.example || ''
            },
            solution: req.body.solution,
            testResults: req.body.testResults || { allPassed: true },
            analysis: req.body.analysis || {}
        });
        res.json({ question });
    } catch (error) {
        console.error('Error generating question:', error);
        res.status(500).json({ error: error.message });
    }
});

// Генерация технического вопроса (для второй задачи)
app.post('/api/chat/technical-question', async (req, res) => {
    try {
        // Передаем полную информацию о задаче для более конкретного вопроса
        const task = req.body.task || {};
        const question = await solutionAnalyzer.generateTechnicalFollowUpQuestion({
            task: {
                description: task.description || task.task || '',
                requirements: task.requirements || task.constraints || [],
                constraints: task.constraints || [],
                expectedComplexity: task.expectedComplexity || '',
                examples: task.examples || [],
                example: task.example || ''
            },
            solution: req.body.solution,
            testResults: req.body.testResults || { allPassed: true },
            analysis: req.body.analysis || {}
        });
        res.json({ question });
    } catch (error) {
        console.error('Error generating technical question:', error);
        res.status(500).json({ error: error.message });
    }
});

// Генерация третьего завершающего вопроса (для второй задачи)
app.post('/api/chat/third-question', async (req, res) => {
    try {
        const question = await solutionAnalyzer.generateThirdQuestion({
            task: req.body.task,
            solution: req.body.solution,
            previousAnswer: req.body.previousAnswer,
            analysis: req.body.analysis
        });
        res.json({ question });
    } catch (error) {
        console.error('Error generating third question:', error);
        res.status(500).json({ error: error.message });
    }
});

// Генерация дополнительного технического вопроса (если ответ недостаточен)
app.post('/api/chat/additional-question', async (req, res) => {
    try {
        const task = req.body.task || {};
        const question = await solutionAnalyzer.generateAdditionalTechnicalQuestion({
            task: {
                description: task.description || task.task || '',
                requirements: task.requirements || task.constraints || [],
                constraints: task.constraints || [],
                expectedComplexity: task.expectedComplexity || '',
                examples: task.examples || [],
                example: task.example || ''
            },
            solution: req.body.solution,
            previousQuestion: req.body.previousQuestion,
            previousAnswer: req.body.previousAnswer,
            analysis: req.body.analysis || {},
            questionNumber: req.body.questionNumber || 1
        });
        res.json({ question });
    } catch (error) {
        console.error('Error generating additional question:', error);
        res.status(500).json({ error: error.message });
    }
});

// Резюмирование разговора по задаче
app.post('/api/chat/summarize', async (req, res) => {
    try {
        const task = req.body.task || {};
        const summary = await solutionAnalyzer.summarizeTaskConversation({
            task: {
                description: task.description || task.task || '',
                requirements: task.requirements || task.constraints || [],
                constraints: task.constraints || [],
                expectedComplexity: task.expectedComplexity || '',
                examples: task.examples || [],
                example: task.example || ''
            },
            solution: req.body.solution,
            analysis: req.body.analysis || {},
            chatHistory: req.body.chatHistory || []
        });
        res.json({ summary });
    } catch (error) {
        console.error('Error summarizing conversation:', error);
        res.status(500).json({ error: error.message });
    }
});

// Оценка ответа
app.post('/api/chat/evaluate', async (req, res) => {
    try {
        const evaluation = await solutionAnalyzer.evaluateAnswer({
            question: req.body.question,
            answer: req.body.answer,
            solution: req.body.solution
        });
        res.json(evaluation);
    } catch (error) {
        console.error('Error evaluating answer:', error);
        res.status(500).json({ error: error.message });
    }
});

// Финальный вопрос
app.post('/api/chat/final-question', async (req, res) => {
    try {
        const question = await solutionAnalyzer.generateFinalQuestion({
            taskHistory: req.body.taskHistory,
            currentTask: req.body.currentTask,
            metrics: req.body.metrics
        });
        res.json({ question });
    } catch (error) {
        console.error('Error generating final question:', error);
        res.status(500).json({ error: error.message });
    }
});

// Диалоговый ответ
app.post('/api/chat/dialogue', async (req, res) => {
    try {
        const response = await solutionAnalyzer.generateDialogueResponse({
            question: req.body.question,
            answer: req.body.answer,
            context: req.body.context
        });
        res.json({ response });
    } catch (error) {
        console.error('Error generating dialogue:', error);
        res.status(500).json({ error: error.message });
    }
});

// Генерация отчета
app.post('/api/reports/generate', async (req, res) => {
    try {
        const report = await reportGenerator.generateReport({
            sessionId: `session_${Date.now()}`,
            candidateId: 'demo_candidate',
            taskHistory: req.body.taskHistory,
            chatHistory: req.body.chatHistory,
            metrics: req.body.metrics
        });
        res.json(report);
    } catch (error) {
        console.error('Error generating report:', error);
        res.status(500).json({ error: error.message });
    }
});

// ----- Admin APIs -----
app.get('/api/admin/overview', (req, res) => {
  res.json({
    tasks: adminData.tasks,
    sessions: adminData.sessions,
    candidates: adminData.candidates,
    settings: adminData.settings,
    stats: adminData.stats,
    reports: adminData.reports,
    antiCheatEvents: adminData.antiCheatEvents.slice(-100)
  });
});

app.get('/api/admin/tasks', (req, res) => {
  const { level, topic, search } = req.query;
  let tasks = [...adminData.tasks];

  if (level) {
    tasks = tasks.filter(task => task.level === level);
  }

  if (topic) {
    tasks = tasks.filter(task => task.topic === topic);
  }

  if (search) {
    const term = search.toLowerCase();
    tasks = tasks.filter(task =>
      task.title.toLowerCase().includes(term) ||
      task.description?.toLowerCase().includes(term) ||
      task.id.toLowerCase().includes(term)
    );
  }

  res.json(tasks);
});

app.get('/api/admin/tasks/:id', (req, res) => {
  const task = adminData.tasks.find(item => item.id === req.params.id);
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }
  res.json(task);
});

app.post('/api/admin/tasks', (req, res) => {
  const { title, description, level, topic, tags, visibility } = req.body;
  if (!title || !description || !level || !topic) {
    return res.status(400).json({ error: 'title, description, level и topic обязательны' });
  }

  const newTask = {
    id: generateTaskId(level),
    title,
    description,
    level,
    topic,
    tags: Array.isArray(tags)
      ? tags
      : (tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : []),
    updated: new Date().toISOString().slice(0, 10),
    visibility: visibility || 'draft'
  };

  adminData.tasks.unshift(newTask);
  persistAdminData(adminData);
  res.status(201).json(newTask);
});

app.put('/api/admin/tasks/:id', (req, res) => {
  const index = adminData.tasks.findIndex(task => task.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Task not found' });
  }

  const existing = adminData.tasks[index];
  const updatedTask = {
    ...existing,
    ...req.body,
    tags: (() => {
      const incoming = req.body.tags;
      if (Array.isArray(incoming)) return incoming;
      if (typeof incoming === 'string') {
        return incoming.split(',').map(t => t.trim()).filter(Boolean);
      }
      return existing.tags || [];
    })(),
    id: existing.id,
    updated: new Date().toISOString().slice(0, 10)
  };

  adminData.tasks[index] = updatedTask;
  persistAdminData(adminData);
  res.json(updatedTask);
});

app.delete('/api/admin/tasks/:id', (req, res) => {
  const index = adminData.tasks.findIndex(task => task.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Task not found' });
  }

  const [removed] = adminData.tasks.splice(index, 1);
  persistAdminData(adminData);
  res.json(removed);
});

app.put('/api/admin/settings', (req, res) => {
  adminData.settings = mergeNested(adminData.settings, req.body);
  persistAdminData(adminData);
  res.json(adminData.settings);
});

app.post('/api/admin/sessions/refresh', (req, res) => {
  adminData.sessions = adminData.sessions.map(session => {
    if (session.status === 'active') {
      const delta = Math.round(Math.random() * 10);
      return {
        ...session,
        progress: Math.min(session.progress + delta, 100),
        status: session.progress + delta >= 100 ? 'completed' : 'active'
      };
    }
    return session;
  });

  persistAdminData(adminData);
  res.json(adminData.sessions);
});

app.get('/api/admin/candidates', (req, res) => {
  const { status } = req.query;
  const list = status ? adminData.candidates.filter(c => c.status === status) : adminData.candidates;
  res.json(list);
});

app.post('/api/admin/reports', (req, res) => {
  const report = {
    id: `REP-${Date.now()}`,
    createdAt: new Date().toISOString(),
    ...req.body
  };

  adminData.reports.push(report);

  if (report.candidateSummary) {
    const index = adminData.candidates.findIndex(candidate => candidate.id === report.candidateSummary.id);
    if (index === -1) {
      adminData.candidates.push(report.candidateSummary);
    } else {
      adminData.candidates[index] = {
        ...adminData.candidates[index],
        ...report.candidateSummary
      };
    }
  }

  persistAdminData(adminData);
  res.status(201).json(report);
});

app.post('/api/anti-cheat/events', (req, res) => {
  const { type, details } = req.body;
  if (!type) {
    return res.status(400).json({ error: 'type is required' });
  }

  const event = {
    id: `ACE-${Date.now()}`,
    type,
    details: details || {},
    createdAt: new Date().toISOString()
  };

  adminData.antiCheatEvents.push(event);
  if (adminData.antiCheatEvents.length > MAX_ANTI_CHEAT_EVENTS) {
    adminData.antiCheatEvents = adminData.antiCheatEvents.slice(-MAX_ANTI_CHEAT_EVENTS);
  }

  persistAdminData(adminData);
  res.json({ status: 'ok' });
});

app.get('/api/anti-cheat/events', (req, res) => {
  res.json(adminData.antiCheatEvents.slice(-200));
});

app.get('/api/admin/export', (req, res) => {
  const format = (req.query.format || 'json').toLowerCase();
  const payload = {
    generatedAt: new Date().toISOString(),
    settings: adminData.settings,
    tasks: adminData.tasks,
    candidates: adminData.candidates,
    sessions: adminData.sessions,
    reports: adminData.reports
  };

  if (format === 'csv') {
    const header = ['name', 'level', 'overall', 'technical', 'communication', 'attempts', 'time', 'status'];
    const rows = adminData.candidates.map(candidate => [
      candidate.name,
      candidate.level,
      candidate.overall,
      candidate.technical,
      candidate.communication,
      candidate.attempts,
      candidate.time,
      candidate.status
    ]);
    const csv = [header.join(','), ...rows.map(r => r.join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="admin-candidates-${Date.now()}.csv"`);
    return res.send(csv);
  }

  res.json(payload);
});

app.listen(PORT, () => {
    console.log(`✅ Backend server running on http://localhost:${PORT}`);
}).on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        console.error(`❌ Порт ${PORT} уже занят! Остановите другой процесс или измените PORT в server.js`);
    } else {
        console.error('❌ Ошибка при запуске сервера:', error.message);
    }
    process.exit(1);
});

