import LLMClient from './llm-client.js';
import PROMPTS from '../prompts/interview-prompts.js';

class SolutionAnalyzer {
  constructor(apiKey = null, options = {}) {
    this.llmClient = new LLMClient(apiKey, options);
  }

  /**
   * Полный анализ решения кандидата
   * @param {Object} params - Параметры анализа
   * @param {string} params.code - Код кандидата
   * @param {Object} params.task - Задача
   * @param {Object} params.testResults - Результаты тестов
   * @param {number} params.previousAttempts - Количество предыдущих попыток
   * @returns {Object} Детальный анализ решения
   */
  async analyze(params) {
    const { code, task, testResults, previousAttempts = 0 } = params;

    console.log(`\n🔍 Анализ решения для задачи: ${task.id}`);
    console.log(`Попыток: ${previousAttempts + 1}`);

    const prompt = PROMPTS.analyzeSolution(code, task, testResults, previousAttempts);

    try {
      const analysis = await this.llmClient.analyzeCode([
        {
          role: 'system',
          content: 'Ты эксперт по анализу кода. Анализируй решения объективно и предоставляй конструктивный фидбек. Будь точным в оценке сложности и качества кода.'
        },
        {
          role: 'user',
          content: prompt
        }
      ], {
        temperature: 0.3 // Низкая температура для более точного анализа
      });

      // Дополняем анализ метриками
      const enhancedAnalysis = {
        correctness: analysis.correctness || 0,
        optimality: analysis.optimality || 0,
        codeQuality: analysis.codeQuality || 0,
        timeComplexity: analysis.timeComplexity || 'не определена',
        spaceComplexity: analysis.spaceComplexity || 'не определена',
        feedback: analysis.feedback || '',
        strengths: analysis.strengths || [],
        weaknesses: analysis.weaknesses || [],
        suggestions: analysis.suggestions || [],
        overallScore: this.calculateOverallScore(analysis)
      };

      console.log(`✅ Анализ завершен. Общая оценка: ${enhancedAnalysis.overallScore}/100`);
      
      return enhancedAnalysis;
    } catch (error) {
      console.error('Ошибка при анализе решения:', error);
      throw error;
    }
  }

  /**
   * Анализ ошибок в решении
   * @param {Object} params - Параметры анализа ошибок
   * @param {string} params.code - Код кандидата
   * @param {Object} params.task - Задача
   * @param {Array} params.failedTests - Провалившиеся тесты
   * @param {boolean} params.visiblePassed - Прошли ли видимые тесты
   * @returns {Object} Анализ ошибок с объяснением
   */
  async analyzeError(params) {
    const { code, task, failedTests, visiblePassed } = params;

    console.log(`\n🔍 Анализ ошибок в решении`);
    console.log(`Провалившихся тестов: ${failedTests.length}`);
    console.log(`Видимые тесты: ${visiblePassed ? '✅ прошли' : '❌ не прошли'}`);

    const prompt = PROMPTS.analyzeError(code, task, failedTests, visiblePassed);

    try {
      const explanation = await this.llmClient.chatDialogue([
        {
          role: 'system',
          content: 'Ты ментор по программированию. Объясняй ошибки четко и направляй кандидатов к решению, не выдавая полный ответ.'
        },
        {
          role: 'user',
          content: prompt
        }
      ], {
        temperature: 0.6
      });

      const errorType = this.detectErrorType(failedTests);
      const suggestedFix = await this.suggestFix(code, task, failedTests);

      return {
        explanation,
        errorType,
        suggestedFix,
        failedTestsCount: failedTests.length,
        visiblePassed
      };
    } catch (error) {
      console.error('Ошибка при анализе ошибок:', error);
      throw error;
    }
  }

  /**
   * Генерация вопроса для кандидата о его решении
   * @param {Object} params - Параметры
   * @param {Object} params.task - Задача
   * @param {string} params.solution - Решение кандидата
   * @param {Object} params.testResults - Результаты тестов
   * @returns {string} Вопрос для кандидата
   */
  async generateFollowUpQuestion(params) {
    const { task, solution, testResults } = params;

    console.log(`\n💬 Генерация вопроса о решении`);

    const prompt = PROMPTS.generateFollowUpQuestion(task, solution, testResults);

    try {
      const question = await this.llmClient.chatDialogue([
        {
          role: 'system',
          content: 'Ты интервьюер. Задай один вопрос от первого лица ("Я", "Мне интересно"). Будь кратким. Только вопрос.'
        },
        {
          role: 'user',
          content: prompt
        }
      ], {
        temperature: 0.8,
        max_tokens: 150 // Уменьшено для ускорения
      });

      return question;
    } catch (error) {
      console.error('Ошибка при генерации вопроса:', error);
      throw error;
    }
  }

  /**
   * Оценка ответа кандидата на вопрос
   * @param {Object} params - Параметры
   * @param {string} params.question - Вопрос
   * @param {string} params.answer - Ответ кандидата
   * @param {string} params.solution - Решение кандидата
   * @returns {Object} Оценка ответа
   */
  async evaluateAnswer(params) {
    const { question, answer, solution } = params;

    console.log(`\n📝 Оценка ответа кандидата`);

    const prompt = PROMPTS.evaluateAnswer(question, answer, solution);

    try {
      const evaluation = await this.llmClient.analyzeCode([
        {
          role: 'system',
          content: 'Ты оцениваешь коммуникативные навыки и понимание кандидата. Будь справедливым и объективным.'
        },
        {
          role: 'user',
          content: prompt
        }
      ], {
        temperature: 0.4
      });

      return {
        score: evaluation.score || 0,
        feedback: evaluation.feedback || '',
        understanding: evaluation.understanding || 0,
        communication: evaluation.communication || 0,
        details: evaluation.details || {}
      };
    } catch (error) {
      console.error('Ошибка при оценке ответа:', error);
      throw error;
    }
  }

  /**
   * Генерация финального вопроса для диалога
   * @param {Object} params - Параметры
   * @param {Array} params.taskHistory - История задач
   * @param {Object} params.currentTask - Текущая задача
   * @param {Object} params.metrics - Метрики кандидата
   * @returns {string} Финальный вопрос
   */
  async generateFinalQuestion(params) {
    const { taskHistory, currentTask, metrics } = params;

    console.log(`\n💬 Генерация финального вопроса`);

    const prompt = PROMPTS.generateFinalQuestion(taskHistory, currentTask, metrics);

    try {
      const question = await this.llmClient.chatDialogue([
        {
          role: 'system',
          content: 'Ты проводишь финальное обсуждение интервью. Задавай значимые вопросы об опыте. Будь естественным и вовлекающим.'
        },
        {
          role: 'user',
          content: prompt
        }
      ], {
        temperature: 0.8
      });

      return question;
    } catch (error) {
      console.error('Ошибка при генерации финального вопроса:', error);
      throw error;
    }
  }

  /**
   * Генерация ответа в диалоге
   * @param {Object} params - Параметры
   * @param {string} params.question - Вопрос
   * @param {string} params.answer - Ответ кандидата
   * @param {Object} params.context - Контекст (задачи, метрики)
   * @returns {string} Ответ интервьюера
   */
  async generateDialogueResponse(params) {
    const { question, answer, context } = params;

    console.log(`\n💬 Генерация ответа в диалоге`);

    const prompt = PROMPTS.generateDialogueResponse(question, answer, context);

    try {
      const response = await this.llmClient.chatDialogue([
        {
          role: 'system',
          content: 'Ты ведешь естественный разговор с кандидатом. Будь вовлекающим и проницательным. Держи ответы краткими.'
        },
        {
          role: 'user',
          content: prompt
        }
      ], {
        temperature: 0.8
      });

      return response;
    } catch (error) {
      console.error('Ошибка при генерации ответа:', error);
      throw error;
    }
  }

  /**
   * Определение типа ошибки
   * @param {Array} failedTests - Провалившиеся тесты
   * @returns {string} Тип ошибки
   */
  detectErrorType(failedTests) {
    if (failedTests.some(t => t.description?.includes('Boundary') || t.type === 'boundary')) {
      return 'boundary_case';
    }
    if (failedTests.some(t => t.description?.includes('Large') || t.type === 'performance')) {
      return 'performance';
    }
    if (failedTests.some(t => t.description?.includes('Edge') || t.type === 'edge_case')) {
      return 'edge_case';
    }
    return 'logic_error';
  }

  /**
   * Предложение исправления (подсказка)
   * @param {string} code - Код кандидата
   * @param {Object} task - Задача
   * @param {Array} failedTests - Провалившиеся тесты
   * @returns {string} Подсказка для исправления
   */
  async suggestFix(code, task, failedTests) {
    const prompt = `Дан код, который не проходит некоторые тесты. Предложи подсказку для исправления, но не давай полное решение.

Код:
${code}

Задача: ${task.description}
Провалившиеся тесты: ${JSON.stringify(failedTests)}

Предоставь подсказку для исправления проблемы.`;

    try {
      return await this.llmClient.chatDialogue([
        {
          role: 'system',
          content: 'Ты ментор по программированию. Предоставляй подсказки, а не решения. Будь полезным, но не выдавай ответ.'
        },
        {
          role: 'user',
          content: prompt
        }
      ], {
        temperature: 0.6
      });
    } catch (error) {
      console.error('Ошибка при генерации подсказки:', error);
      return 'Попробуйте проанализировать провалившиеся тесты и найти паттерн в ошибках.';
    }
  }

  /**
   * Расчет общей оценки
   * @param {Object} analysis - Результаты анализа
   * @returns {number} Общая оценка (0-100)
   */
  calculateOverallScore(analysis) {
    const correctnessWeight = 0.5;  // 50% - правильность
    const optimalityWeight = 0.3;   // 30% - оптимальность
    const qualityWeight = 0.2;      // 20% - качество кода

    return Math.round(
      (analysis.correctness || 0) * correctnessWeight +
      (analysis.optimality || 0) * optimalityWeight +
      (analysis.codeQuality || 0) * qualityWeight
    );
  }
}

export default SolutionAnalyzer;

