import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

async function testConnection() {
  const apiKey = process.env.QWEN_API_KEY || process.env.OPENAI_API_KEY;
  const baseURL = process.env.QWEN_API_BASE || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
  const model = process.env.TASK_MODEL || 'qwen-turbo';

  console.log('=== Тест подключения к Qwen ===\n');
  console.log('API Key:', apiKey ? `${apiKey.substring(0, 10)}...` : 'не установлен');
  console.log('Base URL:', baseURL);
  console.log('Model:', model);
  console.log('');

  if (!apiKey) {
    console.error('❌ API ключ не найден!');
    return;
  }

  try {
    const client = new OpenAI({
      apiKey: apiKey,
      baseURL: baseURL
    });

    console.log('Попытка подключения...\n');

    // Простой тест запроса
    const response = await client.chat.completions.create({
      model: model,
      messages: [
        {
          role: 'user',
          content: 'Привет! Ответь одним словом: "Работает"'
        }
      ],
      max_tokens: 10
    });

    console.log('✅ Подключение успешно!');
    console.log('Ответ:', response.choices[0].message.content);
    console.log('\nПолный ответ:');
    console.log(JSON.stringify(response, null, 2));

  } catch (error) {
    console.error('❌ Ошибка подключения:');
    console.error('Статус:', error.status);
    console.error('Сообщение:', error.message);
    
    if (error.response) {
      console.error('\nДетали ответа:');
      console.error(JSON.stringify(error.response.data, null, 2));
    }

    // Попробуем альтернативные варианты
    console.log('\n\n=== Попытка альтернативных вариантов ===\n');
    
    // Вариант 1: Без baseURL (если это другой провайдер)
    if (baseURL.includes('dashscope')) {
      console.log('Попытка 1: Проверка других возможных endpoints...');
      const alternatives = [
        'https://api.openai.com/v1', // Если это OpenAI ключ
        'http://localhost:11434/v1', // Если это локальный Ollama
      ];

      for (const altURL of alternatives) {
        try {
          console.log(`Пробую: ${altURL}`);
          const altClient = new OpenAI({
            apiKey: apiKey,
            baseURL: altURL
          });

          const altResponse = await altClient.chat.completions.create({
            model: 'gpt-3.5-turbo', // Для OpenAI
            messages: [{ role: 'user', content: 'Hi' }],
            max_tokens: 5
          });

          console.log(`✅ Работает с ${altURL}!`);
          console.log('Ответ:', altResponse.choices[0].message.content);
          break;
        } catch (altError) {
          console.log(`❌ ${altURL} не работает: ${altError.message}`);
        }
      }
    }
  }
}

testConnection();

