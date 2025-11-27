import LevelAssessor from './core/level-assessor.js';
import AdaptiveTaskSelector from './core/adaptive-selector.js';
import TaskGenerator from './llm/task-generator.js';
import SolutionAnalyzer from './llm/solution-analyzer.js';
import dotenv from 'dotenv';

dotenv.config();

async function testAdaptiveSystem() {
  console.log('=== Тест адаптивной системы подбора задач ===\n');

  const apiKey = process.env.QWEN_API_KEY || process.env.OPENAI_API_KEY;
  
  const levelAssessor = new LevelAssessor(apiKey);
  const adaptiveSelector = new AdaptiveTaskSelector(apiKey);
  const taskGenerator = new TaskGenerator(apiKey);
  const solutionAnalyzer = new SolutionAnalyzer(apiKey);

  const taskHistory = [];
  let currentLevel = 'Junior';

  try {
    // Этап 1: Генерация первой задачи (Junior)
    console.log('📋 ЭТАП 1: Генерация первой задачи (Junior уровень)\n');
    const firstTask = await taskGenerator.generateTask({
      level: 'Junior',
      topic: 'arrays',
      language: 'python'
    });

    console.log(`✅ Задача сгенерирована:`);
    console.log(`ID: ${firstTask.id}`);
    console.log(`Описание: ${firstTask.description.substring(0, 100)}...\n`);

    // Симуляция решения кандидата
    const candidateCode1 = `def solution(arr):
    result = []
    for num in arr:
        if num > 0:
            result.append(num)
    return result`;

    const testResults1 = {
      visiblePassed: true,
      hiddenPassed: true,
      allPassed: true
    };

    const metrics1 = {
      timeSpent: 45000, // 45 секунд
      attempts: 1,
      testResults: testResults1
    };

    // Этап 2: Определение уровня на основе первой задачи
    console.log('\n📊 ЭТАП 2: Определение уровня кандидата\n');
    const levelAssessment = await levelAssessor.assessFirstTask({
      code: candidateCode1,
      task: firstTask,
      metrics: metrics1
    });

    currentLevel = levelAssessment.level;
    console.log(`\n✅ Уровень определен: ${currentLevel}`);
    console.log(`Уверенность: ${levelAssessment.confidence}%`);
    console.log(`Правильность: ${levelAssessment.correctness}/100`);
    console.log(`Оптимальность: ${levelAssessment.optimality}/100`);
    console.log(`Качество кода: ${levelAssessment.codeQuality}/100`);

    // Анализ решения
    const analysis1 = await solutionAnalyzer.analyze({
      code: candidateCode1,
      task: firstTask,
      testResults: testResults1,
      previousAttempts: 0
    });

    // Сохраняем в историю
    taskHistory.push({
      taskId: firstTask.id,
      level: firstTask.level,
      topic: firstTask.topic,
      score: analysis1.overallScore,
      timeSpent: metrics1.timeSpent,
      attempts: metrics1.attempts,
      analysis: analysis1
    });

    // Этап 3: Адаптивный подбор второй задачи
    console.log('\n\n🎯 ЭТАП 3: Адаптивный подбор второй задачи\n');
    
    const performance = {
      overallScore: analysis1.overallScore,
      avgTimeSpent: metrics1.timeSpent,
      avgAttempts: metrics1.attempts,
      trend: 'stable'
    };

    const nextTaskResult = await adaptiveSelector.selectNextTask({
      currentLevel: currentLevel,
      taskHistory: taskHistory,
      performance: performance,
      preferredTopic: null
    });

    const secondTask = nextTaskResult.task;
    console.log(`\n✅ Вторая задача подобрана:`);
    console.log(`ID: ${secondTask.id}`);
    console.log(`Уровень: ${secondTask.level}`);
    console.log(`Тема: ${secondTask.topic}`);
    console.log(`Адаптация: ${nextTaskResult.adaptation}`);
    console.log(`Объяснение: ${nextTaskResult.reasoning}`);

    // Симуляция решения второй задачи
    const candidateCode2 = `def solution(arr):
    if not arr:
        return -1
    max_diff = -1
    min_val = arr[0]
    for i in range(1, len(arr)):
        if arr[i] > min_val:
            max_diff = max(max_diff, arr[i] - min_val)
        min_val = min(min_val, arr[i])
    return max_diff`;

    const testResults2 = {
      visiblePassed: true,
      hiddenPassed: true,
      allPassed: true
    };

    const metrics2 = {
      timeSpent: 120000, // 2 минуты
      attempts: 2,
      testResults: testResults2
    };

    const analysis2 = await solutionAnalyzer.analyze({
      code: candidateCode2,
      task: secondTask,
      testResults: testResults2,
      previousAttempts: 1
    });

    taskHistory.push({
      taskId: secondTask.id,
      level: secondTask.level,
      topic: secondTask.topic,
      score: analysis2.overallScore,
      timeSpent: metrics2.timeSpent,
      attempts: metrics2.attempts,
      analysis: analysis2
    });

    // Этап 4: Обновление уровня на основе прогресса
    console.log('\n\n📊 ЭТАП 4: Обновление уровня на основе прогресса\n');
    
    const updatedLevel = await levelAssessor.updateLevel({
      currentLevel: currentLevel,
      taskHistory: taskHistory,
      latestResult: {
        score: analysis2.overallScore,
        correctness: analysis2.correctness,
        optimality: analysis2.optimality,
        codeQuality: analysis2.codeQuality
      }
    });

    console.log(`Предыдущий уровень: ${updatedLevel.previousLevel}`);
    console.log(`Новый уровень: ${updatedLevel.newLevel}`);
    console.log(`Изменение: ${updatedLevel.levelChange}`);
    console.log(`Тренд: ${updatedLevel.trend}`);
    console.log(`Уверенность: ${updatedLevel.confidence}%`);

    currentLevel = updatedLevel.newLevel;

    // Этап 5: Адаптивный подбор третьей задачи с учетом прогресса
    console.log('\n\n🎯 ЭТАП 5: Адаптивный подбор третьей задачи\n');
    
    const avgScore = taskHistory.reduce((sum, t) => sum + t.score, 0) / taskHistory.length;
    const avgTime = taskHistory.reduce((sum, t) => sum + t.timeSpent, 0) / taskHistory.length;
    const avgAttempts = taskHistory.reduce((sum, t) => sum + t.attempts, 0) / taskHistory.length;

    const performance2 = {
      overallScore: avgScore,
      avgTimeSpent: avgTime,
      avgAttempts: avgAttempts,
      trend: updatedLevel.trend
    };

    const thirdTaskResult = await adaptiveSelector.selectNextTask({
      currentLevel: currentLevel,
      taskHistory: taskHistory,
      performance: performance2,
      preferredTopic: 'algorithms'
    });

    const thirdTask = thirdTaskResult.task;
    console.log(`\n✅ Третья задача подобрана:`);
    console.log(`ID: ${thirdTask.id}`);
    console.log(`Уровень: ${thirdTask.level}`);
    console.log(`Тема: ${thirdTask.topic}`);
    console.log(`Адаптация: ${thirdTaskResult.adaptation}`);
    console.log(`Объяснение: ${thirdTaskResult.reasoning}`);

    // Итоговая статистика
    console.log('\n\n' + '='.repeat(60));
    console.log('📈 ИТОГОВАЯ СТАТИСТИКА');
    console.log('='.repeat(60));
    console.log(`\nНачальный уровень: Junior`);
    console.log(`Финальный уровень: ${currentLevel}`);
    console.log(`Выполнено задач: ${taskHistory.length}`);
    console.log(`\nСредняя оценка: ${avgScore.toFixed(1)}/100`);
    console.log(`Среднее время решения: ${(avgTime / 1000).toFixed(1)} секунд`);
    console.log(`Среднее количество попыток: ${avgAttempts.toFixed(1)}`);
    console.log(`\nИстория задач:`);
    taskHistory.forEach((t, i) => {
      console.log(`  ${i + 1}. ${t.level} - ${t.topic} (${t.score}/100)`);
    });

    console.log('\n✅ Тестирование адаптивной системы завершено!\n');

  } catch (error) {
    console.error('\n❌ Ошибка при тестировании:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
  }
}

// Запуск теста
testAdaptiveSystem();




