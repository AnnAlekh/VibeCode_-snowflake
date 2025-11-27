import LLMClient from './llm-client.js';
import PROMPTS from '../prompts/interview-prompts.js';

class ReportGenerator {
  constructor(apiKey = null, options = {}) {
    this.llmClient = new LLMClient(apiKey, options);
  }

  async generateReport(params) {
    const { sessionId, candidateId, taskHistory, chatHistory, metrics } = params;

    console.log(`\n📊 Генерация финального отчета...`);

    const prompt = PROMPTS.generateReport(taskHistory, chatHistory, metrics);

    try {
      const report = await this.llmClient.generateReport([
        {
          role: 'system',
          content: 'Ты эксперт-интервьюер. Генерируй комплексные, справедливые и конструктивные отчеты об интервью. Будь детальным, но кратким.'
        },
        {
          role: 'user',
          content: prompt
        }
      ], {
        temperature: 0.5
      });

      const enhancedReport = {
        sessionId,
        candidateId,
        generatedAt: new Date().toISOString(),
        summary: {
          totalTasks: taskHistory.length,
          totalTime: metrics.timeSpent || 0,
          successRate: this.calculateSuccessRate(taskHistory),
          averageScores: this.calculateAverageScores(taskHistory)
        },
        strengths: report.strengths || [],
        weaknesses: report.weaknesses || [],
        detailedAnalysis: report.detailedAnalysis || '',
        recommendations: report.recommendations || [],
        overallAssessment: report.overallAssessment || '',
        scores: {
          technical: this.calculateTechnicalScore(taskHistory),
          communication: this.calculateCommunicationScore(chatHistory),
          codeQuality: this.calculateCodeQualityScore(taskHistory),
          overall: this.calculateOverallScore(taskHistory, chatHistory, report),
        },
        taskDetails: taskHistory.map((task) => ({
          taskId: task.id,
          level: task.level,
          topic: task.topic,
          timeSpent: task.metrics?.timeSpent || 0,
          attempts: task.attempts || 1,
          score: task.analysis?.overallScore || 0,
        })),
        chatSummary: this.summarizeChat(chatHistory),
      };

      console.log(`✅ Отчет сгенерирован`);
      return enhancedReport;
    } catch (error) {
      console.error('Ошибка при генерации отчета:', error);
      // Fallback отчет
      return this.generateFallbackReport(params);
    }
  }

  calculateSuccessRate(taskHistory) {
    if (taskHistory.length === 0) return 0;
    const passed = taskHistory.filter(t => (t.analysis?.overallScore || 0) >= 60).length;
    return Math.round((passed / taskHistory.length) * 100);
  }

  calculateAverageScores(taskHistory) {
    if (taskHistory.length === 0) {
      return { correctness: 0, optimality: 0, codeQuality: 0 };
    }

    const sum = taskHistory.reduce((acc, t) => {
      const analysis = t.analysis || {};
      return {
        correctness: acc.correctness + (analysis.correctness || 0),
        optimality: acc.optimality + (analysis.optimality || 0),
        codeQuality: acc.codeQuality + (analysis.codeQuality || 0)
      };
    }, { correctness: 0, optimality: 0, codeQuality: 0 });

    return {
      correctness: Math.round(sum.correctness / taskHistory.length),
      optimality: Math.round(sum.optimality / taskHistory.length),
      codeQuality: Math.round(sum.codeQuality / taskHistory.length)
    };
  }

  calculateTechnicalScore(taskHistory) {
    const averages = this.calculateAverageScores(taskHistory);
    return Math.round(
      averages.correctness * 0.4 +
      averages.optimality * 0.3 +
      averages.codeQuality * 0.3
    );
  }

  calculateCommunicationScore(chatHistory) {
    // Упрощенный расчет на основе количества сообщений и качества
    const userMessages = chatHistory.filter(m => m.role === 'user').length;
    return Math.min(100, userMessages * 15); // Базовый расчет
  }

  calculateOverallScore(taskHistory, chatHistory, report) {
    const technical = this.calculateTechnicalScore(taskHistory);
    const communication = this.calculateCommunicationScore(chatHistory);
    return Math.round(technical * 0.7 + communication * 0.3);
  }

  generateFallbackReport(params) {
    const { sessionId, candidateId, taskHistory, chatHistory, metrics } =
      params;

    return {
      sessionId,
      candidateId,
      generatedAt: new Date().toISOString(),
      summary: {
        totalTasks: taskHistory.length,
        totalTime: metrics.timeSpent || 0,
        successRate: this.calculateSuccessRate(taskHistory),
        averageScores: this.calculateAverageScores(taskHistory)
      },
      strengths: [],
      weaknesses: [],
      detailedAnalysis: '',
      recommendations: [],
      overallAssessment: '',
      scores: {
        technical: this.calculateTechnicalScore(taskHistory),
        communication: this.calculateCommunicationScore(chatHistory),
        codeQuality: this.calculateCodeQualityScore(taskHistory),
        overall: this.calculateOverallScore(taskHistory, chatHistory, {}),
      },
      taskDetails: taskHistory.map((task) => ({
        taskId: task.id,
        level: task.level,
        topic: task.topic,
        timeSpent: task.metrics?.timeSpent || 0,
        attempts: task.attempts || 1,
        score: task.analysis?.overallScore || 0,
      })),
      chatSummary: this.summarizeChat(chatHistory),
    };
  }
}

export default ReportGenerator;
