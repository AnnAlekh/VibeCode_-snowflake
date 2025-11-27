import LLMClient from '../llm/llm-client.js';
import PROMPTS from '../prompts/interview-prompts.js';

class LevelAssessor {
  constructor(apiKey = null, options = {}) {
    this.llmClient = new LLMClient(apiKey, options);
  }

  /**
   * Определение уровня кандидата на основе первой задачи
   * @param {Object} params - Параметры оценки
   * @param {string} params.code - Код кандидата
   * @param {Object} params.task - Задача
   * @param {Object} params.metrics - Метрики (время, попытки, результаты тестов)
   * @returns {Object} Оценка уровня кандидата
   */
  async assessFirstTask(params) {
    const { code, task, metrics } = params;

    console.log(`\n📊 Определение уровня кандидата на основе первой задачи...`);
    console.log(`Задача: ${task.level} уровень, ${task.topic}`);
    console.log(`Время решения: ${metrics.timeSpent}ms`);
    console.log(`Попыток: ${metrics.attempts}`);

    const prompt = PROMPTS.assessLevel(code, task, metrics);

    try {
      const assessment = await this.llmClient.analyzeCode([
        {
          role: 'system',
          content: 'Ты эксперт по оценке уровня программистов. Определяй уровень объективно на основе кода, времени решения и качества решения.'
        },
        {
          role: 'user',
          content: prompt
        }
      ], {
        temperature: 0.3
      });

      const level = this.determineLevel({
        correctness: assessment.correctness || 0,
        optimality: assessment.optimality || 0,
        codeQuality: assessment.codeQuality || 0,
        timeSpent: metrics.timeSpent,
        attempts: metrics.attempts,
        testResults: metrics.testResults
      });

      const enhancedAssessment = {
        level,
        confidence: this.calculateConfidence(assessment, metrics),
        correctness: assessment.correctness || 0,
        optimality: assessment.optimality || 0,
        codeQuality: assessment.codeQuality || 0,
        strengths: assessment.strengths || [],
        weaknesses: assessment.weaknesses || [],
        reasoning: assessment.reasoning || '',
        suggestedNextLevel: assessment.suggestedNextLevel || level
      };

      console.log(`✅ Уровень определен: ${level}`);
      console.log(`Уверенность: ${enhancedAssessment.confidence}%`);

      return enhancedAssessment;
    } catch (error) {
      console.error('Ошибка при определении уровня:', error);
      // Fallback: определяем уровень на основе простых метрик
      return this.fallbackLevelAssessment(metrics);
    }
  }

  /**
   * Обновление оценки уровня на основе последующих задач
   * @param {Object} params - Параметры
   * @param {string} params.currentLevel - Текущий уровень
   * @param {Object} params.taskHistory - История задач и результатов
   * @param {Object} params.latestResult - Последний результат
   * @returns {Object} Обновленная оценка уровня
   */
  async updateLevel(params) {
    const { currentLevel, taskHistory, latestResult } = params;

    console.log(`\n📊 Обновление оценки уровня...`);
    console.log(`Текущий уровень: ${currentLevel}`);
    console.log(`Выполнено задач: ${taskHistory.length}`);

    const prompt = PROMPTS.updateLevel(currentLevel, taskHistory, latestResult);

    try {
      const update = await this.llmClient.analyzeCode([
        {
          role: 'system',
          content: 'Ты обновляешь оценку уровня кандидата на основе его прогресса. Будь объективным и учитывай тренды.'
        },
        {
          role: 'user',
          content: prompt
        }
      ], {
        temperature: 0.3
      });

      const newLevel = update.newLevel || currentLevel;
      const levelChange = this.compareLevels(currentLevel, newLevel);

      return {
        previousLevel: currentLevel,
        newLevel: newLevel,
        levelChange: levelChange, // 'up', 'down', 'same'
        confidence: update.confidence || 70,
        reasoning: update.reasoning || '',
        trend: this.calculateTrend(taskHistory)
      };
    } catch (error) {
      console.error('Ошибка при обновлении уровня:', error);
      return {
        previousLevel: currentLevel,
        newLevel: currentLevel,
        levelChange: 'same',
        confidence: 50
      };
    }
  }

  /**
   * Определение уровня на основе метрик
   * @param {Object} scores - Оценки и метрики
   * @returns {string} Уровень (Junior, Middle, Senior)
   */
  determineLevel(scores) {
    const { correctness, optimality, codeQuality, timeSpent, attempts, testResults } = scores;

    // Базовые критерии
    const avgScore = (correctness + optimality + codeQuality) / 3;
    const allTestsPassed = testResults?.allPassed || false;
    const timeEfficient = timeSpent < 300000; // Меньше 5 минут
    const fewAttempts = attempts <= 2;

    // Логика определения уровня
    if (avgScore >= 85 && allTestsPassed && timeEfficient && fewAttempts) {
      // Высокие оценки, все тесты прошли, быстро, с первой-второй попытки
      return 'Middle';
    } else if (avgScore >= 70 && allTestsPassed) {
      // Хорошие оценки, все тесты прошли
      return 'Junior+'; // Между Junior и Middle
    } else if (avgScore >= 60 || (allTestsPassed && attempts <= 3)) {
      // Средние оценки или все тесты прошли, но с несколькими попытками
      return 'Junior';
    } else {
      // Низкие оценки или не все тесты прошли
      return 'Junior-'; // Ниже Junior
    }
  }

  /**
   * Расчет уверенности в оценке
   * @param {Object} assessment - Оценка от LLM
   * @param {Object} metrics - Метрики
   * @returns {number} Уверенность в процентах
   */
  calculateConfidence(assessment, metrics) {
    let confidence = 70; // Базовая уверенность

    // Увеличиваем уверенность, если все тесты прошли
    if (metrics.testResults?.allPassed) {
      confidence += 10;
    }

    // Увеличиваем уверенность, если мало попыток
    if (metrics.attempts <= 2) {
      confidence += 10;
    }

    // Увеличиваем уверенность, если оценки согласованы
    const scores = [
      assessment.correctness,
      assessment.optimality,
      assessment.codeQuality
    ];
    const variance = this.calculateVariance(scores);
    if (variance < 10) {
      confidence += 10;
    }

    return Math.min(confidence, 100);
  }

  /**
   * Расчет дисперсии для оценки согласованности
   */
  calculateVariance(values) {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  /**
   * Fallback оценка уровня при ошибке LLM
   */
  fallbackLevelAssessment(metrics) {
    const allPassed = metrics.testResults?.allPassed || false;
    const attempts = metrics.attempts || 1;
    const timeSpent = metrics.timeSpent || 0;

    let level = 'Junior';
    if (allPassed && attempts <= 2 && timeSpent < 300000) {
      level = 'Middle';
    } else if (!allPassed || attempts > 3) {
      level = 'Junior-';
    }

    return {
      level,
      confidence: 50,
      reasoning: 'Оценка на основе базовых метрик (fallback)'
    };
  }

  /**
   * Сравнение уровней
   */
  compareLevels(oldLevel, newLevel) {
    const levels = ['Junior-', 'Junior', 'Junior+', 'Middle', 'Middle+', 'Senior'];
    const oldIndex = levels.indexOf(oldLevel);
    const newIndex = levels.indexOf(newLevel);

    if (newIndex > oldIndex) return 'up';
    if (newIndex < oldIndex) return 'down';
    return 'same';
  }

  /**
   * Расчет тренда на основе истории
   */
  calculateTrend(taskHistory) {
    if (taskHistory.length < 2) return 'stable';

    const recentScores = taskHistory.slice(-3).map(t => t.score || 0);
    const earlierScores = taskHistory.slice(0, -3).map(t => t.score || 0);

    if (recentScores.length === 0 || earlierScores.length === 0) {
      return 'stable';
    }

    const recentAvg = recentScores.reduce((a, b) => a + b, 0) / recentScores.length;
    const earlierAvg = earlierScores.reduce((a, b) => a + b, 0) / earlierScores.length;

    if (recentAvg > earlierAvg + 5) return 'improving';
    if (recentAvg < earlierAvg - 5) return 'declining';
    return 'stable';
  }
}

export default LevelAssessor;

