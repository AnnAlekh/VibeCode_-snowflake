import TaskGenerator from '../llm/task-generator.js';
import LLMClient from '../llm/llm-client.js';
import PROMPTS from '../prompts/interview-prompts.js';

class AdaptiveTaskSelector {
  constructor(apiKey = null, options = {}) {
    this.taskGenerator = new TaskGenerator(apiKey, options);
    this.llmClient = new LLMClient(apiKey, options);
    this.taskBank = []; // Банк задач (в реальности - из БД)
  }

  /**
   * Адаптивный подбор следующей задачи
   * @param {Object} params - Параметры подбора
   * @param {string} params.currentLevel - Текущий уровень кандидата
   * @param {Array} params.taskHistory - История выполненных задач
   * @param {Object} params.performance - Производительность кандидата
   * @param {string} params.preferredTopic - Предпочитаемая тема (опционально)
   * @returns {Object} Следующая задача
   */
  async selectNextTask(params) {
    const { currentLevel, taskHistory, performance, preferredTopic } = params;

    console.log(`\n🎯 Адаптивный подбор следующей задачи...`);
    console.log(`Текущий уровень: ${currentLevel}`);
    console.log(`Выполнено задач: ${taskHistory.length}`);
    console.log(`Производительность: ${JSON.stringify(performance)}`);

    // Определяем параметры следующей задачи
    const nextTaskParams = await this.determineNextTaskParams({
      currentLevel,
      taskHistory,
      performance,
      preferredTopic
    });

    console.log(`\n📋 Параметры следующей задачи:`);
    console.log(`- Уровень: ${nextTaskParams.level}`);
    console.log(`- Тема: ${nextTaskParams.topic}`);
    console.log(`- Язык: ${nextTaskParams.language}`);

    // Генерируем задачу с учетом предыдущей задачи и производительности
    const previousTask = taskHistory.length > 0 ? taskHistory[taskHistory.length - 1] : null;
    
    const task = await this.taskGenerator.generateTaskStream({
      level: nextTaskParams.level,
      topic: nextTaskParams.topic,
      language: nextTaskParams.language,
      previousTask: previousTask,
      candidatePerformance: {
        level: currentLevel,
        score: performance.overallScore || 0,
        timeSpent: performance.avgTimeSpent || 0,
        attempts: performance.avgAttempts || 0,
        trend: performance.trend || 'stable'
      }
    }, (chunk, accumulated) => {
      // Real-time отображение генерации
      process.stdout.write(chunk);
    });

    console.log(`\n✅ Задача адаптивно подобрана и сгенерирована`);
    console.log(`ID: ${task.id}`);

    return {
      task,
      reasoning: nextTaskParams.reasoning,
      adaptation: nextTaskParams.adaptation
    };
  }

  /**
   * Определение параметров следующей задачи
   * @param {Object} params - Параметры
   * @returns {Object} Параметры следующей задачи
   */
  async determineNextTaskParams(params) {
    const { currentLevel, taskHistory, performance, preferredTopic } = params;

    // Если это первая задача после определения уровня
    if (taskHistory.length === 0) {
      const topics = this.selectTopicForLevel(currentLevel);
      const selectedTopic = preferredTopic || (Array.isArray(topics) ? topics[0] : topics);
      
      return {
        level: currentLevel,
        topic: selectedTopic,
        language: 'python',
        reasoning: 'Первая задача после определения уровня',
        adaptation: 'initial'
      };
    }

    // Анализируем производительность
    const avgScore = performance.overallScore || 0;
    const trend = performance.trend || 'stable';
    const lastTask = taskHistory[taskHistory.length - 1];
    const lastScore = lastTask.score || 0;

    // Определяем следующий уровень
    let nextLevel = currentLevel;
    let adaptation = 'maintain';

    if (avgScore >= 85 && trend === 'improving') {
      // Кандидат показывает отличные результаты и улучшается
      nextLevel = this.increaseLevel(currentLevel);
      adaptation = 'increase_difficulty';
    } else if (avgScore >= 70 && lastScore >= 80) {
      // Хорошие результаты на последней задаче
      nextLevel = this.increaseLevel(currentLevel);
      adaptation = 'slight_increase';
    } else if (avgScore < 60 || trend === 'declining') {
      // Низкие результаты или ухудшение
      nextLevel = this.decreaseLevel(currentLevel);
      adaptation = 'decrease_difficulty';
    } else {
      // Стабильные результаты
      nextLevel = currentLevel;
      adaptation = 'maintain_level';
    }

    // Выбираем тему (разнообразие или углубление)
    const topic = this.selectTopic({
      currentLevel: nextLevel,
      taskHistory,
      preferredTopic,
      adaptation
    });

    // Используем LLM для финального решения
    const prompt = PROMPTS.selectNextTask(currentLevel, nextLevel, taskHistory, performance, topic);

    try {
      const llmSuggestion = await this.llmClient.analyzeCode([
        {
          role: 'system',
          content: 'Ты адаптивная система подбора задач. Предлагай оптимальные параметры следующей задачи на основе производительности кандидата.'
        },
        {
          role: 'user',
          content: prompt
        }
      ], {
        temperature: 0.5
      });

      // Используем предложение LLM, если оно разумное
      if (llmSuggestion.level && this.isValidLevel(llmSuggestion.level)) {
        nextLevel = llmSuggestion.level;
      }
      if (llmSuggestion.topic) {
        topic = llmSuggestion.topic;
      }
    } catch (error) {
      console.log('LLM предложение недоступно, используем алгоритмическое решение');
    }

    return {
      level: nextLevel,
      topic: topic,
      language: 'python',
      reasoning: this.generateReasoning(adaptation, currentLevel, nextLevel, performance),
      adaptation: adaptation
    };
  }

  /**
   * Увеличение уровня сложности
   */
  increaseLevel(currentLevel) {
    const levels = {
      'Junior-': 'Junior',
      'Junior': 'Junior+',
      'Junior+': 'Middle',
      'Middle': 'Middle+',
      'Middle+': 'Senior',
      'Senior': 'Senior'
    };
    return levels[currentLevel] || currentLevel;
  }

  /**
   * Уменьшение уровня сложности
   */
  decreaseLevel(currentLevel) {
    const levels = {
      'Junior-': 'Junior-',
      'Junior': 'Junior-',
      'Junior+': 'Junior',
      'Middle': 'Junior+',
      'Middle+': 'Middle',
      'Senior': 'Middle+'
    };
    return levels[currentLevel] || currentLevel;
  }

  /**
   * Выбор темы для уровня
   */
  selectTopicForLevel(level) {
    const topicsByLevel = {
      'Junior-': ['arrays', 'strings', 'basic_math'],
      'Junior': ['arrays', 'strings', 'basic_algorithms'],
      'Junior+': ['arrays', 'strings', 'two_pointers', 'sliding_window'],
      'Middle': ['algorithms', 'data_structures', 'dynamic_programming'],
      'Middle+': ['algorithms', 'graphs', 'trees', 'dynamic_programming'],
      'Senior': ['algorithms', 'system_design', 'optimization', 'advanced_data_structures']
    };

    return topicsByLevel[level] || ['algorithms'];
  }

  /**
   * Выбор темы с учетом истории
   */
  selectTopic(params) {
    const { currentLevel, taskHistory, preferredTopic, adaptation } = params;

    // Если есть предпочитаемая тема и она не использовалась недавно
    if (preferredTopic) {
      const recentTopics = taskHistory.slice(-2).map(t => t.topic);
      if (!recentTopics.includes(preferredTopic)) {
        return preferredTopic;
      }
    }

    // Выбираем тему, которая не использовалась недавно
    const recentTopics = taskHistory.slice(-2).map(t => t.topic);
    const availableTopics = this.selectTopicForLevel(currentLevel);
    
    if (Array.isArray(availableTopics)) {
      const unusedTopics = availableTopics.filter(t => !recentTopics.includes(t));

      if (unusedTopics.length > 0) {
        return unusedTopics[0];
      }

      // Если все темы использовались, возвращаемся к первой
      return availableTopics[0];
    }
    
    // Fallback
    return availableTopics || 'algorithms';
  }

  /**
   * Проверка валидности уровня
   */
  isValidLevel(level) {
    const validLevels = ['Junior-', 'Junior', 'Junior+', 'Middle', 'Middle+', 'Senior'];
    return validLevels.includes(level);
  }

  /**
   * Генерация объяснения адаптации
   */
  generateReasoning(adaptation, oldLevel, newLevel, performance) {
    const reasonings = {
      'increase_difficulty': `Увеличена сложность с ${oldLevel} до ${newLevel} на основе отличных результатов (${performance.overallScore}/100) и улучшающегося тренда.`,
      'slight_increase': `Незначительно увеличена сложность с ${oldLevel} до ${newLevel} на основе хороших результатов на последней задаче.`,
      'decrease_difficulty': `Уменьшена сложность с ${oldLevel} до ${newLevel} для лучшего соответствия текущему уровню кандидата.`,
      'maintain_level': `Сложность сохранена на уровне ${newLevel} для закрепления навыков.`
    };

    return reasonings[adaptation] || `Задача подобрана на уровне ${newLevel}.`;
  }
}

export default AdaptiveTaskSelector;

