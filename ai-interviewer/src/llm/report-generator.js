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

      const technicalScore = this.calculateTechnicalScore(taskHistory);
      const communicationScore = this.calculateCommunicationScore(chatHistory);
      const overallScore = this.calculateOverallScore(taskHistory, chatHistory, report);
      
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
        detailedAnalysis: report.detailedAnalysis || report.analysis || '',
        recommendations: report.recommendations || report.recommendation || [],
        overallAssessment: report.overallAssessment || report.assessment || report.recommendation || '',
        breakdown: report.breakdown || this.generateBreakdown(taskHistory, chatHistory),
        sections: report.sections || this.generateSections(taskHistory, chatHistory),
        metrics: {
          technical: technicalScore,
          communication: communicationScore,
          overall: overallScore,
          tasksCompleted: taskHistory.length,
          averageTaskScore: this.calculateAverageTaskScore(taskHistory),
          timeEfficiency: this.calculateTimeEfficiency(taskHistory, metrics.timeSpent)
        },
        scores: {
          technical: technicalScore,
          communication: communicationScore,
          overall: overallScore
        },
        // Для совместимости с тестами
        overallScore: overallScore,
        score: overallScore,
        recommendation: report.recommendation || report.recommendations?.[0] || this.getRecommendation(overallScore),
        level: this.determineLevel(overallScore)
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

  calculateAverageTaskScore(taskHistory) {
    if (taskHistory.length === 0) return 0;
    const sum = taskHistory.reduce((acc, t) => acc + (t.analysis?.overallScore || t.score || 0), 0);
    return Math.round(sum / taskHistory.length);
  }

  calculateTimeEfficiency(taskHistory, totalTime) {
    if (!totalTime || taskHistory.length === 0) return 0;
    const avgTimePerTask = totalTime / taskHistory.length;
    // Нормализуем: меньше времени = выше эффективность
    return Math.max(0, Math.min(100, 100 - (avgTimePerTask / 1000) * 10));
  }

  generateBreakdown(taskHistory, chatHistory) {
    return {
      tasks: taskHistory.map(t => ({
        id: t.task?.id || 'unknown',
        score: t.analysis?.overallScore || t.score || 0,
        correctness: t.analysis?.correctness || 0,
        optimality: t.analysis?.optimality || 0
      })),
      communication: {
        questionsAnswered: chatHistory.filter(m => m.role === 'user').length,
        quality: this.calculateCommunicationScore(chatHistory)
      }
    };
  }

  generateSections(taskHistory, chatHistory) {
    return [
      {
        title: 'Технические навыки',
        content: `Выполнено задач: ${taskHistory.length}. Средняя оценка: ${this.calculateAverageTaskScore(taskHistory)}/100.`,
        score: this.calculateTechnicalScore(taskHistory)
      },
      {
        title: 'Коммуникативные навыки',
        content: `Дано ответов: ${chatHistory.filter(m => m.role === 'user').length}.`,
        score: this.calculateCommunicationScore(chatHistory)
      }
    ];
  }

  getRecommendation(overallScore) {
    if (overallScore >= 80) return 'Рекомендован к найму';
    if (overallScore >= 60) return 'Требуется дополнительная оценка';
    return 'Не рекомендован';
  }

  determineLevel(overallScore) {
    if (overallScore >= 85) return 'Senior';
    if (overallScore >= 70) return 'Middle';
    return 'Junior';
  }

  generateFallbackReport(params) {
    const { sessionId, candidateId, taskHistory, chatHistory, metrics } = params;
    const overallScore = this.calculateOverallScore(taskHistory, chatHistory, {});
    
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
      strengths: ['Хорошее понимание базовых концепций'],
      weaknesses: ['Можно улучшить оптимальность решений'],
      detailedAnalysis: 'Кандидат показал базовые навыки программирования.',
      recommendations: ['Практиковаться в алгоритмах', 'Изучить оптимизацию кода'],
      overallAssessment: 'Средний уровень подготовки.',
      breakdown: this.generateBreakdown(taskHistory, chatHistory),
      sections: this.generateSections(taskHistory, chatHistory),
      metrics: {
        technical: this.calculateTechnicalScore(taskHistory),
        communication: this.calculateCommunicationScore(chatHistory),
        overall: overallScore,
        tasksCompleted: taskHistory.length,
        averageTaskScore: this.calculateAverageTaskScore(taskHistory),
        timeEfficiency: this.calculateTimeEfficiency(taskHistory, metrics.timeSpent)
      },
      scores: {
        technical: this.calculateTechnicalScore(taskHistory),
        communication: this.calculateCommunicationScore(chatHistory),
        overall: overallScore
      },
      overallScore: overallScore,
      score: overallScore,
      recommendation: this.getRecommendation(overallScore),
      level: this.determineLevel(overallScore)
    };
  }
}

export default ReportGenerator;




