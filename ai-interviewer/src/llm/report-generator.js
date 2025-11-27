import LLMClient from './llm-client.js';
import PROMPTS from '../prompts/interview-prompts.js';
import fs from 'fs';
import PDFDocument from 'pdfkit';
import { createObjectCsvWriter } from 'csv-writer';

class ReportGenerator {
  constructor(apiKey = null, options = {}) {
    this.llmClient = new LLMClient(apiKey, options);
  }

  async generateReport(params) {
    const { sessionId, candidateId, taskHistory, chatHistory, metrics } =
      params;

    console.log(`\n📊 Генерация финального отчета для сессии ${sessionId}...`);

    const prompt = PROMPTS.generateReport(taskHistory, chatHistory, metrics);

    try {
      const report = await this.llmClient.generateReport(
        [
          {
            role: 'system',
            content:
              'Ты эксперт-интервьюер. Генерируй комплексные, справедливые и конструктивные отчеты об интервью. Будь детальным, но кратким. Верни ответ в формате JSON с полями: strengths, weaknesses, detailedAnalysis, recommendations, overallAssessment.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        {
          temperature: 0.5,
          max_tokens: 800,
        },
      );

      const enhancedReport = {
        sessionId,
        candidateId,
        generatedAt: new Date().toISOString(),
        summary: {
          totalTasks: taskHistory.length,
          totalTime: metrics.timeSpent || 0,
          successRate: this.calculateSuccessRate(taskHistory),
          averageScores: this.calculateAverageScores(taskHistory),
          totalAttempts: this.calculateTotalAttempts(taskHistory),
          antiCheatFlags: metrics.antiCheatFlags || 0,
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

      console.log(
        `✅ Отчет сгенерирован успешно. Общая оценка: ${enhancedReport.scores.overall}/100`,
      );
      return enhancedReport;
    } catch (error) {
      console.error('Ошибка при генерации отчета:', error);
      return this.generateFallbackReport(params);
    }
  }

  calculateSuccessRate(taskHistory) {
    if (taskHistory.length === 0) return 0;
    const passed = taskHistory.filter(
      (t) => (t.analysis?.overallScore || 0) >= 60,
    ).length;
    return Math.round((passed / taskHistory.length) * 100);
  }

  calculateAverageScores(taskHistory) {
    if (taskHistory.length === 0) {
      return { correctness: 0, optimality: 0, codeQuality: 0 };
    }

    const sum = taskHistory.reduce(
      (acc, t) => {
        const analysis = t.analysis || {};
        return {
          correctness: acc.correctness + (analysis.correctness || 0),
          optimality: acc.optimality + (analysis.optimality || 0),
          codeQuality: acc.codeQuality + (analysis.codeQuality || 0),
        };
      },
      { correctness: 0, optimality: 0, codeQuality: 0 },
    );

    return {
      correctness: Math.round(sum.correctness / taskHistory.length),
      optimality: Math.round(sum.optimality / taskHistory.length),
      codeQuality: Math.round(sum.codeQuality / taskHistory.length),
    };
  }

  calculateTotalAttempts(taskHistory) {
    return taskHistory.reduce((acc, t) => acc + (t.attempts || 1), 0);
  }

  calculateTechnicalScore(taskHistory) {
    const averages = this.calculateAverageScores(taskHistory);
    return Math.round(
      averages.correctness * 0.4 +
        averages.optimality * 0.3 +
        averages.codeQuality * 0.3,
    );
  }

  calculateCommunicationScore(chatHistory) {
    const userMessages = chatHistory.filter((m) => m.role === 'user').length;
    const averageLength =
      chatHistory.reduce((acc, m) => acc + (m.content?.length || 0), 0) /
      (chatHistory.length || 1);
    return Math.min(100, userMessages * 10 + (averageLength > 50 ? 20 : 0));
  }

  calculateCodeQualityScore(taskHistory) {
    const averages = this.calculateAverageScores(taskHistory);
    return averages.codeQuality;
  }

  calculateOverallScore(taskHistory, chatHistory, report) {
    const technical = this.calculateTechnicalScore(taskHistory);
    const communication = this.calculateCommunicationScore(chatHistory);
    const codeQuality = this.calculateCodeQualityScore(taskHistory);
    return Math.round(
      technical * 0.5 + communication * 0.3 + codeQuality * 0.2,
    );
  }

  summarizeChat(chatHistory) {
    return chatHistory.map((msg) => ({
      role: msg.role,
      content:
        msg.content.substring(0, 100) + (msg.content.length > 100 ? '...' : ''),
    }));
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
        averageScores: this.calculateAverageScores(taskHistory),
        totalAttempts: this.calculateTotalAttempts(taskHistory),
        antiCheatFlags: metrics.antiCheatFlags || 0,
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

  async exportToPDF(report, filePath) {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      // Регистрация шрифтов
      doc.registerFont('Roboto-Regular', './fonts/Roboto-Regular.ttf');
      doc.registerFont('Roboto-Bold', './fonts/Roboto-Bold.ttf');

      // Обложка с градиентом
      const gradient = doc.linearGradient(0, 0, doc.page.width, 180);
      gradient.stop(0, '#00BFFF').stop(1, '#1E90FF');
      doc.rect(0, 0, doc.page.width, 180).fill(gradient);

      // Логотип +|TI
      doc
        .font('Roboto-Bold')
        .fillColor('white')
        .fontSize(28)
        .text('+|TI', 50, 50);

      // VibeCODE
      doc.fontSize(48).text('VibeCODE', 50, 90);

      // Команда Снежинка
      doc.font('Roboto-Regular').fontSize(16).text('Команда Снежинка', 50, 150);

      // Основной заголовок
      doc.moveDown(6);
      doc
        .font('Roboto-Bold')
        .fillColor('black')
        .fontSize(24)
        .text('Финальный Отчёт по Интервью', { align: 'center' });

      // Инфо о сессии
      doc.moveDown(1);
      doc
        .font('Roboto-Regular')
        .fontSize(12)
        .text(`Сессия ID: ${report.sessionId}`, { align: 'center' });
      doc.text(`Кандидат ID: ${report.candidateId}`, { align: 'center' });
      doc.text(`Дата: ${report.generatedAt}`, { align: 'center' });

      doc.moveDown(2);

      // Сводка
      doc
        .font('Roboto-Bold')
        .fontSize(18)
        .fillColor('#1E90FF')
        .text('Сводка', 50);
      doc
        .font('Roboto-Regular')
        .fillColor('black')
        .fontSize(12)
        .text(`Всего задач: ${report.summary.totalTasks}`, 50)
        .text(`Общее время: ${report.summary.totalTime} мин`)
        .text(`Процент успеха: ${report.summary.successRate}%`)
        .text(`Всего попыток: ${report.summary.totalAttempts}`)
        .text(`Флаги античита: ${report.summary.antiCheatFlags}`);

      doc.moveDown(1);

      // Оценки с барами
      doc
        .font('Roboto-Bold')
        .fontSize(18)
        .fillColor('#1E90FF')
        .text('Оценки', 50);
      const barY = doc.y + 10;
      const barWidth = 200;
      const barHeight = 15;

      // Техническая
      doc
        .fontSize(12)
        .fillColor('black')
        .text(`Техническая: ${report.scores.technical}/100`, 50, barY);
      doc
        .rect(
          200,
          barY + 5,
          barWidth * (report.scores.technical / 100),
          barHeight,
        )
        .fill('#1E90FF');
      doc.rect(200, barY + 5, barWidth, barHeight).stroke();

      // Коммуникация
      doc.text(
        `Коммуникация: ${report.scores.communication}/100`,
        50,
        barY + 30,
      );
      doc
        .rect(
          200,
          barY + 35,
          barWidth * (report.scores.communication / 100),
          barHeight,
        )
        .fill('#32CD32');
      doc.rect(200, barY + 35, barWidth, barHeight).stroke();

      // Качество кода
      doc.text(
        `Качество кода: ${report.scores.codeQuality}/100`,
        50,
        barY + 60,
      );
      doc
        .rect(
          200,
          barY + 65,
          barWidth * (report.scores.codeQuality / 100),
          barHeight,
        )
        .fill('#FFD700');
      doc.rect(200, barY + 65, barWidth, barHeight).stroke();

      // Общая
      doc.text(`Общая: ${report.scores.overall}/100`, 50, barY + 90);
      doc
        .rect(
          200,
          barY + 95,
          barWidth * (report.scores.overall / 100),
          barHeight,
        )
        .fill('#32CD32');
      doc.rect(200, barY + 95, barWidth, barHeight).stroke();

      doc.moveDown(6);

      // Сильные стороны
      doc
        .font('Roboto-Bold')
        .fontSize(18)
        .fillColor('#32CD32')
        .text('Сильные стороны', 50);
      doc.font('Roboto-Regular').fillColor('black').fontSize(12);
      report.strengths.forEach((str, index) => {
        doc.text(`• ${str}`, 60);
      });

      doc.moveDown(1);

      // Слабые стороны
      doc
        .font('Roboto-Bold')
        .fontSize(18)
        .fillColor('#FF4500')
        .text('Слабые стороны', 50);
      doc.font('Roboto-Regular').fillColor('black').fontSize(12);
      report.weaknesses.forEach((weak, index) => {
        doc.text(`• ${weak}`, 60);
      });

      doc.moveDown(1);

      // Детальный анализ
      doc
        .font('Roboto-Bold')
        .fontSize(18)
        .fillColor('#1E90FF')
        .text('Детальный анализ', 50);
      doc
        .font('Roboto-Regular')
        .fontSize(12)
        .fillColor('black')
        .text(report.detailedAnalysis, 50, doc.y, {
          align: 'justify',
          width: doc.page.width - 100,
        });

      doc.moveDown(1);

      // Рекомендации
      doc
        .font('Roboto-Bold')
        .fontSize(18)
        .fillColor('#1E90FF')
        .text('Рекомендации', 50);
      doc.font('Roboto-Regular').fillColor('black').fontSize(12);
      report.recommendations.forEach((rec, index) => {
        doc.text(`• ${rec}`, 60);
      });

      doc.moveDown(1);

      // Общая оценка
      doc
        .font('Roboto-Bold')
        .fontSize(18)
        .fillColor('#1E90FF')
        .text('Общая оценка', 50);
      doc
        .font('Roboto-Regular')
        .fontSize(12)
        .fillColor('black')
        .text(report.overallAssessment, 50, doc.y, {
          align: 'justify',
          width: doc.page.width - 100,
        });

      // Футер
      doc
        .font('Roboto-Regular')
        .fontSize(10)
        .fillColor('gray')
        .text(
          'VibeCODE by Команда Снежинка | +|TI Хакатон',
          0,
          doc.page.height - 60,
          { align: 'center' },
        );

      doc.end();

      stream.on('finish', () => {
        console.log(`PDF отчет сохранен: ${filePath}`);
        resolve(filePath);
      });
      stream.on('error', reject);
    });
  }

  async exportToCSV(report, filePath) {
    const writer = createObjectCsvWriter({
      path: filePath,
      header: [
        { id: 'section', title: 'Section' },
        { id: 'key', title: 'Key' },
        { id: 'value', title: 'Value' },
      ],
    });

    const records = [];

    records.push({
      section: 'Summary',
      key: 'Total Tasks',
      value: report.summary.totalTasks,
    });
    records.push({
      section: 'Summary',
      key: 'Total Time',
      value: report.summary.totalTime,
    });
    records.push({
      section: 'Summary',
      key: 'Success Rate',
      value: report.summary.successRate,
    });
    records.push({
      section: 'Summary',
      key: 'Total Attempts',
      value: report.summary.totalAttempts,
    });
    records.push({
      section: 'Summary',
      key: 'Anti-Cheat Flags',
      value: report.summary.antiCheatFlags,
    });

    records.push({
      section: 'Scores',
      key: 'Technical',
      value: report.scores.technical,
    });
    records.push({
      section: 'Scores',
      key: 'Communication',
      value: report.scores.communication,
    });
    records.push({
      section: 'Scores',
      key: 'Code Quality',
      value: report.scores.codeQuality,
    });
    records.push({
      section: 'Scores',
      key: 'Overall',
      value: report.scores.overall,
    });

    report.strengths.forEach((str, index) => {
      records.push({
        section: 'Strengths',
        key: `Strength ${index + 1}`,
        value: str,
      });
    });

    report.weaknesses.forEach((weak, index) => {
      records.push({
        section: 'Weaknesses',
        key: `Weakness ${index + 1}`,
        value: weak,
      });
    });

    report.recommendations.forEach((rec, index) => {
      records.push({
        section: 'Recommendations',
        key: `Recommendation ${index + 1}`,
        value: rec,
      });
    });

    records.push({
      section: 'Analysis',
      key: 'Detailed Analysis',
      value: report.detailedAnalysis,
    });
    records.push({
      section: 'Analysis',
      key: 'Overall Assessment',
      value: report.overallAssessment,
    });

    await writer.writeRecords(records);
    console.log(`CSV отчет сохранен: ${filePath}`);
    return filePath;
  }
}

export default ReportGenerator;
