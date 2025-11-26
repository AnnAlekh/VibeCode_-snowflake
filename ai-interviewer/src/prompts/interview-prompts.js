const PROMPTS = {
  generateTask: (level, topic, language) => `
Создай задачу уровня ${level} по теме ${topic} на ${language}.

JSON структура:
{
  "task": "Краткое описание задачи",
  "requirements": ["требование 1", "требование 2"],
  "example": "Пример: вход → выход",
  "hint": "Краткая подсказка",
  "starterCode": "def solution(arr):\\n    pass"
}

Уровень: ${level}, тема: ${topic}. Верни ТОЛЬКО JSON без markdown.
  `,

  generateNextTask: (level, topic, language, previousTask, candidatePerformance) => `
Создай задачу уровня ${level} по теме ${topic}.

JSON:
{
  "task": "Краткое описание",
  "requirements": ["требование 1", "требование 2"],
  "example": "Пример: вход → выход",
  "hint": "Подсказка",
  "starterCode": "def solution(arr):\\n    pass"
}

Уровень: ${level}. Только JSON.
  `,

  analyzeSolution: (code, task, testResults, attempts) => `
Проанализируй это решение кандидата:

Задача: ${task.description}
Ожидаемая сложность: ${task.expectedComplexity || 'не указана'}

Код кандидата:
\`\`\`python
${code}
\`\`\`

Результаты тестов:
- Видимые тесты: ${testResults.visiblePassed ? '✅ ПРОШЛИ' : '❌ НЕ ПРОШЛИ'}
- Скрытые тесты: ${testResults.hiddenPassed ? '✅ ПРОШЛИ' : '❌ НЕ ПРОШЛИ'}
- Попыток: ${attempts}

Оцени:
1. Правильность (0-100): Насколько правильное решение? Проходят ли все тесты?
2. Оптимальность (0-100): Соответствует ли временная и пространственная сложность ожидаемой?
3. Качество кода (0-100): Читаемость, стиль, структура, именование переменных
4. Временная сложность: Big O notation (например, O(n), O(n²))
5. Пространственная сложность: Big O notation (например, O(1), O(n))
6. Фидбек: Конструктивная обратная связь
7. Сильные стороны: Массив сильных сторон решения
8. Слабые стороны: Массив областей для улучшения
9. Предложения: Конкретные предложения по улучшению

Верни ТОЛЬКО валидный JSON:
{
  "correctness": 85,
  "optimality": 70,
  "codeQuality": 80,
  "timeComplexity": "O(n)",
  "spaceComplexity": "O(1)",
  "feedback": "Хорошее решение, но можно оптимизировать...",
  "strengths": ["Четкая логика", "Хорошие имена переменных"],
  "weaknesses": ["Можно улучшить читаемость", "Не оптимальная сложность"],
  "suggestions": ["Использовать более эффективный алгоритм", "Добавить комментарии"]
}
  `,

  analyzeError: (code, task, failedTests, visiblePassed) => `
Решение кандидата прошло видимые тесты, но не прошло скрытые тесты.

Задача: ${task.description}

Код кандидата:
\`\`\`python
${code}
\`\`\`

Провалившиеся тесты:
${JSON.stringify(failedTests, null, 2)}

Видимые тесты: ${visiblePassed ? '✅ прошли' : '❌ не прошли'}

Объясни:
1. Почему видимые тесты прошли, а скрытые нет?
2. Какой тип ошибки это (граничный случай, edge case, производительность, логическая ошибка)?
3. Как исправить (предоставь руководство, но не полное решение)?

Будь полезным и образовательным. Направь кандидата к правильному решению.
  `,

  generateFollowUpQuestion: (task, solution, testResults) => `
Кандидат решил задачу: ${task.description || task.task || 'задача'}

Задай один вопрос от первого лица ("Я", "Мне интересно") о:
- Подходе или сложности
- Альтернативных решениях

Только вопрос, кратко.
  `,

  evaluateAnswer: (question, answer, solution) => `
Оцени ответ кандидата на твой вопрос.

Вопрос: ${question}
Ответ кандидата: ${answer}
Их решение: ${solution}

Оцени:
1. Score (0-100): Общее качество ответа
2. Understanding (0-100): Насколько хорошо кандидат понимает свое решение
3. Communication (0-100): Ясность объяснения
4. Feedback: Конструктивная обратная связь
5. Details: Детали оценки

Верни ТОЛЬКО валидный JSON:
{
  "score": 85,
  "understanding": 90,
  "communication": 80,
  "feedback": "Хорошее понимание решения, но можно улучшить объяснение...",
  "details": {
    "strengths": ["Понимает алгоритм", "Может объяснить сложность"],
    "weaknesses": ["Не упомянул альтернативные решения"]
  }
}
  `,

  generateFinalQuestion: (taskHistory, currentTask, metrics) => `
Сгенерируй финальный вопрос для обсуждения с кандидатом.

Кандидат выполнил ${taskHistory.length + 1} задач.
Метрики: ${JSON.stringify(metrics, null, 2)}

Спроси о:
- Их опыте решения задач
- Что они узнали
- С какими вызовами столкнулись
- Как они подходили к проблемам

Будь естественным и разговорчивым. Задай один вопрос.
  `,

  generateDialogueResponse: (question, answer, context) => `
Продолжи разговор естественно.

Твой вопрос: ${question}
Ответ кандидата: ${answer}
Контекст: ${JSON.stringify(context, null, 2)}

Ответь вовлекающе и задай следующий вопрос, если уместно.
  `,

  generateReport: (taskHistory, chatHistory, metrics) => `
Сгенерируй комплексный отчет об интервью.

Выполнено задач: ${taskHistory.length}
История задач: ${JSON.stringify(taskHistory.map(t => ({
  level: t.task?.level,
  score: t.score,
  topic: t.task?.topic
})), null, 2)}

История чата: ${JSON.stringify(chatHistory.slice(-10), null, 2)}

Метрики: ${JSON.stringify(metrics, null, 2)}

Предоставь:
1. Strengths: Массив сильных сторон кандидата
2. Weaknesses: Массив областей для улучшения
3. DetailedAnalysis: Детальный текстовый анализ
4. Recommendations: Рекомендации по развитию
5. OverallAssessment: Общая оценка

Верни ТОЛЬКО валидный JSON:
{
  "strengths": ["сильная сторона 1", "сильная сторона 2"],
  "weaknesses": ["слабая сторона 1", "слабая сторона 2"],
  "detailedAnalysis": "Детальный анализ производительности...",
  "recommendations": ["рекомендация 1", "рекомендация 2"],
  "overallAssessment": "Общая оценка кандидата..."
}
  `,

  assessLevel: (code, task, metrics) => `
Определи уровень кандидата на основе его решения первой задачи.

Задача: ${task.description}
Уровень задачи: ${task.level}
Ожидаемая сложность: ${task.expectedComplexity || 'не указана'}

Код кандидата:
\`\`\`python
${code}
\`\`\`

Метрики:
- Время решения: ${metrics.timeSpent}ms
- Попыток: ${metrics.attempts}
- Все тесты прошли: ${metrics.testResults?.allPassed ? 'да' : 'нет'}

Оцени:
1. Correctness (0-100): Правильность решения
2. Optimality (0-100): Оптимальность алгоритма
3. CodeQuality (0-100): Качество кода
4. SuggestedNextLevel: Предлагаемый следующий уровень (Junior, Junior+, Middle, Middle+, Senior)
5. Reasoning: Объяснение оценки
6. Strengths: Сильные стороны
7. Weaknesses: Слабые стороны

Верни ТОЛЬКО валидный JSON:
{
  "correctness": 85,
  "optimality": 70,
  "codeQuality": 80,
  "suggestedNextLevel": "Middle",
  "reasoning": "Кандидат показал хорошее понимание...",
  "strengths": ["Четкая логика", "Хорошие имена"],
  "weaknesses": ["Можно оптимизировать"]
}
  `,

  updateLevel: (currentLevel, taskHistory, latestResult) => `
Обнови оценку уровня кандидата на основе его прогресса.

Текущий уровень: ${currentLevel}
Выполнено задач: ${taskHistory.length}

История задач:
${JSON.stringify(taskHistory.map(t => ({
  level: t.level,
  score: t.score,
  timeSpent: t.timeSpent,
  attempts: t.attempts
})), null, 2)}

Последний результат:
${JSON.stringify(latestResult, null, 2)}

Определи:
1. NewLevel: Новый уровень (Junior, Junior+, Middle, Middle+, Senior)
2. Confidence (0-100): Уверенность в оценке
3. Reasoning: Объяснение изменения уровня
4. Trend: Тренд (improving, stable, declining)

Верни ТОЛЬКО валидный JSON:
{
  "newLevel": "Middle",
  "confidence": 85,
  "reasoning": "Кандидат показал стабильный рост...",
  "trend": "improving"
}
  `,

  selectNextTask: (currentLevel, suggestedLevel, taskHistory, performance, topic) => `
Подбери параметры следующей задачи для кандидата.

Текущий уровень: ${currentLevel}
Предлагаемый уровень: ${suggestedLevel}
Выполнено задач: ${taskHistory.length}

Производительность:
${JSON.stringify(performance, null, 2)}

История задач (последние 3):
${JSON.stringify(taskHistory.slice(-3).map(t => ({
  level: t.level,
  topic: t.topic,
  score: t.score
})), null, 2)}

Предпочитаемая тема: ${topic || 'любая'}

Определи оптимальные параметры следующей задачи:
1. Level: Уровень сложности
2. Topic: Тема (arrays, strings, algorithms, data_structures, и т.д.)
3. Reasoning: Объяснение выбора

Учти:
- Разнообразие тем (не повторять недавние)
- Соответствие уровню кандидата
- Прогрессию сложности

Верни ТОЛЬКО валидный JSON:
{
  "level": "Middle",
  "topic": "algorithms",
  "reasoning": "Кандидат готов к более сложным задачам..."
}
  `
};

export default PROMPTS;

