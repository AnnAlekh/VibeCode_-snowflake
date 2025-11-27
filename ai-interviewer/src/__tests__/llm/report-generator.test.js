import { describe, test, expect, beforeEach } from '@jest/globals';
import ReportGenerator from '../../llm/report-generator.js';

describe('Report Generator', () => {
  let reportGenerator;

  beforeEach(() => {
    reportGenerator = new ReportGenerator('test-api-key');
  });

  describe('calculateSuccessRate', () => {
    test('должен вычислять процент успешных задач', () => {
      const taskHistory = [
        { analysis: { overallScore: 80 } },
        { analysis: { overallScore: 70 } },
        { analysis: { overallScore: 50 } },
        { analysis: { overallScore: 90 } }
      ];

      const rate = reportGenerator.calculateSuccessRate(taskHistory);
      expect(rate).toBe(75); // 3 из 4 >= 60
    });

    test('должен возвращать 0 для пустой истории', () => {
      const rate = reportGenerator.calculateSuccessRate([]);
      expect(rate).toBe(0);
    });

    test('должен обрабатывать задачи без анализа', () => {
      const taskHistory = [
        { analysis: { overallScore: 80 } },
        {} // без анализа
      ];

      const rate = reportGenerator.calculateSuccessRate(taskHistory);
      expect(rate).toBe(50);
    });
  });

  describe('calculateAverageScores', () => {
    test('должен вычислять средние оценки', () => {
      const taskHistory = [
        { analysis: { correctness: 80, optimality: 70, codeQuality: 75 } },
        { analysis: { correctness: 90, optimality: 85, codeQuality: 80 } }
      ];

      const averages = reportGenerator.calculateAverageScores(taskHistory);
      // Проверяем что средние вычислены правильно (округление может отличаться)
      expect(averages.correctness).toBeGreaterThanOrEqual(84);
      expect(averages.correctness).toBeLessThanOrEqual(86);
      expect(averages.optimality).toBeGreaterThanOrEqual(76);
      expect(averages.optimality).toBeLessThanOrEqual(78);
      expect(averages.codeQuality).toBeGreaterThanOrEqual(76);
      expect(averages.codeQuality).toBeLessThanOrEqual(78);
    });

    test('должен округлять средние оценки', () => {
      const taskHistory = [
        { analysis: { correctness: 81, optimality: 71, codeQuality: 76 } },
        { analysis: { correctness: 82, optimality: 72, codeQuality: 77 } }
      ];

      const averages = reportGenerator.calculateAverageScores(taskHistory);
      expect(averages.correctness).toBe(Math.round((81 + 82) / 2));
      expect(averages.optimality).toBe(Math.round((71 + 72) / 2));
      expect(averages.codeQuality).toBe(Math.round((76 + 77) / 2));
    });

    test('должен возвращать нули для пустой истории', () => {
      const averages = reportGenerator.calculateAverageScores([]);
      expect(averages.correctness).toBe(0);
      expect(averages.optimality).toBe(0);
      expect(averages.codeQuality).toBe(0);
    });
  });

  describe('calculateTechnicalScore', () => {
    test('должен вычислять технический балл', () => {
      const taskHistory = [
        { analysis: { correctness: 80, optimality: 70, codeQuality: 75 } },
        { analysis: { correctness: 90, optimality: 85, codeQuality: 80 } }
      ];

      const score = reportGenerator.calculateTechnicalScore(taskHistory);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(100);
    });
  });

  describe('calculateCommunicationScore', () => {
    test('должен вычислять коммуникативный балл', () => {
      const chatHistory = [
        { role: 'user' },
        { role: 'assistant' },
        { role: 'user' }
      ];

      const score = reportGenerator.calculateCommunicationScore(chatHistory);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    test('должен ограничивать максимальный балл', () => {
      const longChat = Array(20).fill({ role: 'user' });
      const score = reportGenerator.calculateCommunicationScore(longChat);
      expect(score).toBeLessThanOrEqual(100);
    });
  });

  describe('generateFallbackReport', () => {
    test('должен генерировать fallback отчет', () => {
      const params = {
        sessionId: 'test-session',
        candidateId: 'test-candidate',
        taskHistory: [],
        chatHistory: [],
        metrics: { timeSpent: 1000 }
      };

      const report = reportGenerator.generateFallbackReport(params);
      
      expect(report.sessionId).toBe('test-session');
      expect(report.candidateId).toBe('test-candidate');
      expect(report.summary).toBeDefined();
      expect(report.strengths).toBeInstanceOf(Array);
      expect(report.weaknesses).toBeInstanceOf(Array);
      expect(report.recommendations).toBeInstanceOf(Array);
    });
  });
});

