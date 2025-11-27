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
    const { task, solution, testResults, analysis } = params;

    console.log(`\n💬 Генерация технического вопроса о решении первой задачи`);

    const prompt = PROMPTS.generateFollowUpQuestion(task, solution, testResults, analysis);

    try {
      const question = await this.llmClient.chatDialogue([
        {
          role: 'system',
          content: 'Ты технический интервьюер и общаешься ТОЛЬКО на русском языке. В этом ответе нельзя показывать ход рассуждений — никаких вступлений вроде "давайте посмотрим", "сначала я проверю" и т.п. Сформулируй сразу один КОНКРЕТНЫЙ ТЕХНИЧЕСКИЙ вопрос от первого лица, который напрямую связан с конкретными деталями решения кандидата. Вопрос должен ссылаться на конкретные части кода, структуры данных, алгоритмические решения или обработку граничных случаев, которые видны в решении. НЕ задавай общие вопросы - задай конкретный вопрос про конкретный аспект решения. Формат строго: одно или два предложения на русском языке, последние символы ответа — знак вопроса "?". Никаких списков, объяснений до или после вопроса, выводи только сам технический вопрос.'
        },
        {
          role: 'user',
          content: prompt
        }
      ], {
        temperature: 0.6,
        max_tokens: 220
      });

      return question;
    } catch (error) {
      console.error('Ошибка при генерации вопроса:', error);
      throw error;
    }
  }

  /**
   * Генерация технического вопроса для второй задачи
   * @param {Object} params - Параметры
   * @param {Object} params.task - Задача
   * @param {string} params.solution - Решение кандидата
   * @param {Object} params.testResults - Результаты тестов
   * @param {Object} params.analysis - Анализ решения
   * @returns {string} Технический вопрос для кандидата
   */
  async generateTechnicalFollowUpQuestion(params) {
    const { task, solution, testResults, analysis } = params;

    console.log(`\n💬 Генерация технического вопроса о решении второй задачи`);

    const prompt = PROMPTS.generateTechnicalFollowUpQuestion(task, solution, testResults, analysis);

    try {
      const question = await this.llmClient.chatDialogue([
        {
          role: 'system',
          content: 'Ты технический интервьюер и общаешься ТОЛЬКО на русском языке. В этом ответе нельзя показывать ход рассуждений — никаких вступлений вроде "давайте посмотрим", "сначала я проверю" и т.п. Сформулируй сразу один КОНКРЕТНЫЙ ТЕХНИЧЕСКИЙ вопрос от первого лица, который напрямую связан с конкретными деталями решения кандидата. Вопрос должен ссылаться на конкретные части кода, структуры данных, алгоритмические решения или обработку граничных случаев, которые видны в решении. НЕ задавай общие вопросы - задай конкретный вопрос про конкретный аспект решения. Формат строго: одно или два предложения на русском языке, последние символы ответа — знак вопроса "?". Никаких списков, объяснений до или после вопроса, выводи только сам технический вопрос.'
        },
        {
          role: 'user',
          content: prompt
        }
      ], {
        temperature: 0.6,
        max_tokens: 250
      });

      return question;
    } catch (error) {
      console.error('Ошибка при генерации технического вопроса:', error);
      throw error;
    }
  }

  /**
   * Генерация третьего завершающего вопроса для второй задачи
   * @param {Object} params - Параметры
   * @param {Object} params.task - Задача
   * @param {string} params.solution - Решение кандидата
   * @param {string} params.previousAnswer - Предыдущий ответ кандидата
   * @param {Object} params.analysis - Анализ решения
   * @returns {string} Третий завершающий вопрос для кандидата
   */
  async generateThirdQuestion(params) {
    const { task, solution, previousAnswer, analysis } = params;

    console.log(`\n💬 Генерация третьего завершающего вопроса`);

    const prompt = PROMPTS.generateThirdQuestion(task, solution, previousAnswer, analysis);

    try {
      const question = await this.llmClient.chatDialogue([
        {
          role: 'system',
          content: 'Ты технический интервьюер и общаешься ТОЛЬКО на русском языке. В этом ответе нельзя показывать ход рассуждений — никаких вступлений вроде "давайте посмотрим", "сначала я проверю" и т.п. Сформулируй сразу один конкретный завершающий вопрос от первого лица, который углубляется в понимание решения или проверяет способность кандидата рассуждать о масштабируемости, альтернативных подходах, улучшениях или практическом применении. Формат строго: одно или два предложения на русском языке, последние символы ответа — знак вопроса "?". Никаких списков, объяснений до или после вопроса, выводи только сам вопрос.'
        },
        {
          role: 'user',
          content: prompt
        }
      ], {
        temperature: 0.6,
        max_tokens: 280
      });

      return question;
    } catch (error) {
      console.error('Ошибка при генерации третьего вопроса:', error);
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
        isSufficient: evaluation.isSufficient !== undefined ? evaluation.isSufficient : 
                     (evaluation.understanding >= 70 && evaluation.communication >= 70 && evaluation.score >= 70),
        details: evaluation.details || {}
      };
    } catch (error) {
      console.error('Ошибка при оценке ответа:', error);
      throw error;
    }
  }

  /**
   * Генерация дополнительного технического вопроса, если ответ был недостаточным
   * @param {Object} params - Параметры
   * @param {Object} params.task - Задача
   * @param {string} params.solution - Решение кандидата
   * @param {string} params.previousQuestion - Предыдущий вопрос
   * @param {string} params.previousAnswer - Предыдущий ответ кандидата
   * @param {Object} params.analysis - Анализ решения
   * @param {number} params.questionNumber - Номер задачи (1 или 2)
   * @returns {string} Дополнительный технический вопрос
   */
  /**
   * Резюмирует весь разговор по задаче для генерации следующей задачи
   * @param {Object} params - Параметры
   * @param {Object} params.task - Задача
   * @param {string} params.solution - Решение кандидата
   * @param {Object} params.analysis - Анализ решения
   * @param {Array} params.chatHistory - История разговора (все вопросы и ответы)
   * @returns {string} Резюме разговора
   */
  async summarizeTaskConversation(params) {
    const { task, solution, analysis, chatHistory } = params;

    console.log(`\n📝 Резюмирование разговора по задаче: ${task.id}`);

    const prompt = PROMPTS.summarizeTaskConversation(task, solution, analysis, chatHistory);

    try {
      const summary = await this.llmClient.chatDialogue([
        {
          role: 'system',
          content: 'Ты технический интервьюер. Создай краткое резюме разговора по задаче на русском языке. Резюме должно помочь сгенерировать подходящую следующую задачу, учитывая все ответы кандидата и его реальный уровень понимания.'
        },
        {
          role: 'user',
          content: prompt
        }
      ], {
        temperature: 0.5,
        max_tokens: 800
      });

      console.log('✅ Резюме создано');
      return summary.trim();
    } catch (error) {
      console.error('Ошибка при резюмировании:', error);
      throw error;
    }
  },

  async generateAdditionalTechnicalQuestion(params) {
    const { task, solution, previousQuestion, previousAnswer, analysis, questionNumber } = params;

    console.log(`\n💬 Генерация дополнительного технического вопроса для задачи ${questionNumber}`);

    const prompt = PROMPTS.generateAdditionalTechnicalQuestion(
      task, solution, previousQuestion, previousAnswer, analysis, questionNumber
    );

    try {
      const question = await this.llmClient.chatDialogue([
        {
          role: 'system',
          content: 'Ты технический интервьюер и общаешься ТОЛЬКО на русском языке. В этом ответе нельзя показывать ход рассуждений — никаких вступлений вроде "давайте посмотрим", "сначала я проверю" и т.п. Сформулируй сразу один КОНКРЕТНЫЙ ДОПОЛНИТЕЛЬНЫЙ ТЕХНИЧЕСКИЙ вопрос от первого лица, который проверяет ДРУГОЙ аспект решения (не тот, что был в предыдущем вопросе). Вопрос должен быть максимально конкретным и привязанным к деталям кода. Формат строго: одно или два предложения на русском языке, последние символы ответа — знак вопроса "?". Никаких списков, объяснений до или после вопроса, выводи только сам технический вопрос.'
        },
        {
          role: 'user',
          content: prompt
        }
      ], {
        temperature: 0.6,
        max_tokens: 250
      });

      return question;
    } catch (error) {
      console.error('Ошибка при генерации дополнительного технического вопроса:', error);
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
          content: 'Ты проводишь финальный этап интервью и общаешься ТОЛЬКО на русском языке. Все выводы и размышления делай про себя, но в ответе сразу выведи только 1–2 предложения на русском: краткий вывод о кандидате и один осмысленный вопрос о его опыте или дальнейших шагах, завершая текст вопросительным знаком "?". Не описывай, что ты сейчас анализируешь или какие шаги выполняешь, выводи только готовый вопрос/реплику для кандидата.'
        },
        {
          role: 'user',
          content: prompt
        }
      ], {
        temperature: 0.6,
        max_tokens: 250
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
          content: 'Ты ведешь естественный диалог с кандидатом ТОЛЬКО на русском языке. Отвечай кратко (1–3 предложения), без перечислений и технических меток, используя живой, но профессиональный тон.'
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

