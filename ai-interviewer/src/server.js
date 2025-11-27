import express from 'express';
import cors from 'cors';
import TaskGenerator from './llm/task-generator.js';
import SolutionAnalyzer from './llm/solution-analyzer.js';
import LevelAssessor from './core/level-assessor.js';
import AdaptiveTaskSelector from './core/adaptive-selector.js';
import ReportGenerator from './llm/report-generator.js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

const apiKey = process.env.QWEN_API_KEY || process.env.OPENAI_API_KEY;
const taskGenerator = new TaskGenerator(apiKey);
const solutionAnalyzer = new SolutionAnalyzer(apiKey);
const levelAssessor = new LevelAssessor(apiKey);
const adaptiveSelector = new AdaptiveTaskSelector(apiKey);
const reportGenerator = new ReportGenerator(apiKey);

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

// Запуск тестов
app.post('/api/tests/run', async (req, res) => {
    try {
        const { code, task, language } = req.body;
        
        // Симуляция запуска тестов
        const results = {
            visible: task.visibleTestCases.map((testCase, i) => ({
                passed: Math.random() > 0.2, // 80% проходят
                input: testCase.input,
                expected: testCase.output,
                index: i
            })),
            hidden: task.hiddenTestCases.map((testCase, i) => ({
                passed: Math.random() > 0.3, // 70% проходят
                input: testCase.input,
                index: i
            })),
            allPassed: false
        };

        results.allPassed = results.visible.every(t => t.passed) && 
                           results.hidden.every(t => t.passed);

        res.json(results);
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
        const question = await solutionAnalyzer.generateFollowUpQuestion({
            task: req.body.task,
            solution: req.body.solution,
            testResults: { allPassed: true }
        });
        res.json({ question });
    } catch (error) {
        console.error('Error generating question:', error);
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

app.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
});

