import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import SolutionAnalyzer from '../../llm/solution-analyzer.js';

describe('Solution Analyzer', () => {
  let solutionAnalyzer;
  let mockLLMClient;

  beforeEach(() => {
    solutionAnalyzer = new SolutionAnalyzer('test-api-key');
    mockLLMClient = {
      analyzeCode: jest.fn(),
      chatDialogue: jest.fn()
    };
    solutionAnalyzer.llmClient = mockLLMClient;
  });

  describe('calculateOverallScore', () => {
    test('должен вычислять общий балл из метрик', () => {
      const analysis = {
        correctness: 80,
        optimality: 75,
        codeQuality: 70
      };

      const score = solutionAnalyzer.calculateOverallScore(analysis);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    test('должен учитывать все метрики', () => {
      const analysis1 = { correctness: 100, optimality: 100, codeQuality: 100 };
      const analysis2 = { correctness: 50, optimality: 50, codeQuality: 50 };

      const score1 = solutionAnalyzer.calculateOverallScore(analysis1);
      const score2 = solutionAnalyzer.calculateOverallScore(analysis2);

      expect(score1).toBeGreaterThan(score2);
    });

    test('должен обрабатывать отсутствующие метрики', () => {
      const analysis = { correctness: 80 };
      const score = solutionAnalyzer.calculateOverallScore(analysis);
      expect(score).toBeGreaterThanOrEqual(0);
    });
  });

  describe('analyze', () => {
    test('должен возвращать анализ с метриками производительности', async () => {
      const mockAnalysis = {
        correctness: 80,
        optimality: 75,
        codeQuality: 70,
        feedback: 'Good solution'
      };

      mockLLMClient.analyzeCode.mockResolvedValue(mockAnalysis);

      const params = {
        code: 'def solution(): pass',
        task: { id: 'test-task' },
        testResults: {
          visible: [{ executionTime: 100 }],
          hidden: [{ executionTime: 150 }],
          performance: {
            averageVisibleTime: 100,
            averageHiddenTime: 150
          }
        },
        previousAttempts: 0
      };

      const result = await solutionAnalyzer.analyze(params);

      expect(result.correctness).toBe(80);
      expect(result.performance).toBeDefined();
      expect(result.performance.averageExecutionTime).toBeGreaterThan(0);
    });

    test('должен обрабатывать ошибки анализа', async () => {
      mockLLMClient.analyzeCode.mockRejectedValue(new Error('API Error'));

      await expect(solutionAnalyzer.analyze({
        code: 'test',
        task: {},
        testResults: {},
        previousAttempts: 0
      })).rejects.toThrow('API Error');
    });
  });

  describe('analyzeError', () => {
    test('должен анализировать ошибки в решении', async () => {
      const mockExplanation = {
        explanation: 'The error is...',
        hints: ['Hint 1', 'Hint 2']
      };

      mockLLMClient.chatDialogue.mockResolvedValue(mockExplanation);

      const result = await solutionAnalyzer.analyzeError({
        code: 'def solution(): return 1/0',
        task: { id: 'test' },
        failedTests: [{ input: 'test', expected: 'result', actual: 'error' }],
        visiblePassed: false
      });

      expect(result.explanation).toBeDefined();
    });
  });
});

