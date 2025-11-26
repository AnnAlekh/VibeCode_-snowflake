import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

class LLMClient {
  constructor(apiKey = null, options = {}) {
    const key = apiKey || process.env.QWEN_API_KEY || process.env.OPENAI_API_KEY;
    
    if (!key) {
      throw new Error('API key is required. Set QWEN_API_KEY or OPENAI_API_KEY in .env or pass as parameter.');
    }

    // Определяем провайдера и baseURL
    const provider = options.provider || process.env.LLM_PROVIDER || 'qwen';
    
    // Поддержка разных endpoints для Qwen
    let baseURL = options.baseURL || process.env.QWEN_API_BASE;
    
    if (!baseURL && provider === 'qwen') {
      // Попробуем определить endpoint автоматически
      // Если ключ начинается с sk-, это может быть другой провайдер
      if (key.startsWith('sk-')) {
        // Возможные варианты:
        // 1. OpenAI-совместимый API с Qwen
        // 2. Другой провайдер
        // По умолчанию используем DashScope, но можно переопределить
        baseURL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
      } else {
        // Если формат ключа другой, возможно это другой endpoint
        baseURL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
      }
    }

    // Создаем клиент с поддержкой Qwen
    // Для DashScope API ключ должен быть в формате "sk-..."
    const clientConfig = {
      apiKey: key,
      ...(baseURL && { baseURL }),
      // Для DashScope может потребоваться дополнительная настройка
      defaultHeaders: provider === 'qwen' ? {
        'Authorization': `Bearer ${key}`
      } : undefined
    };

    this.client = new OpenAI(clientConfig);
    this.provider = provider;
    
    // Конфигурация моделей Qwen для разных задач
    this.models = {
      taskGeneration: options.taskModel || process.env.TASK_MODEL || 'qwen-turbo',
      taskStreaming: options.streamingModel || process.env.STREAMING_MODEL || 'qwen-turbo',
      codeAnalysis: options.analysisModel || process.env.ANALYSIS_MODEL || 'qwen-plus',
      chat: options.chatModel || process.env.CHAT_MODEL || 'qwen-turbo',
      report: options.reportModel || process.env.REPORT_MODEL || 'qwen-plus'
    };
    
    this.defaultTemperature = options.temperature || 0.7;
    
    console.log(`LLM Client initialized with provider: ${provider}`);
    console.log('Models:', this.models);
    if (baseURL) {
      console.log('API Base URL:', baseURL);
    }
  }

  async chat(messages, options = {}) {
    const model = options.model || this.models.chat;
    const temperature = options.temperature ?? this.defaultTemperature;
    const maxTokens = options.max_tokens || options.maxTokens || 300; // Уменьшено для ускорения
    
    try {
      const response = await this.client.chat.completions.create({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        ...options
      });

      return response.choices[0].message.content;
    } catch (error) {
      console.error('Error in LLM chat:', error);
      throw error;
    }
  }

  async chatStream(messages, onChunk, options = {}) {
    const model = options.model || this.models.taskStreaming;
    const temperature = options.temperature ?? this.defaultTemperature;
    const maxTokens = options.max_tokens || options.maxTokens || 500; // Уменьшено для ускорения
    
    try {
      const stream = await this.client.chat.completions.create({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: true,
        ...options
      });

      let fullContent = '';

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          fullContent += content;
          if (onChunk) {
            onChunk(content, fullContent);
          }
        }
      }

      return fullContent;
    } catch (error) {
      console.error('Error in LLM stream:', error);
      throw error;
    }
  }

  async chatJSON(messages, options = {}) {
    const model = options.model || this.models.taskGeneration;
    const temperature = options.temperature ?? this.defaultTemperature;
    const maxTokens = options.max_tokens || options.maxTokens || 600; // Оптимизировано для задач
    
    try {
      const requestOptions = {
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        ...options
      };

      // Qwen поддерживает response_format, но может требовать другой формат
      // Пробуем добавить, если не указано иначе
      if (!options.response_format && this.provider === 'qwen') {
        // Для Qwen можно использовать response_format или добавить в промпт
        requestOptions.response_format = { type: 'json_object' };
      } else if (options.response_format) {
        requestOptions.response_format = options.response_format;
      }

      const response = await this.client.chat.completions.create(requestOptions);

      const content = response.choices[0].message.content;
      
      // Парсим JSON, если это строка
      let parsed;
      if (typeof content === 'string') {
        // Пытаемся найти JSON в ответе, если он обернут в markdown
        const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || 
                         content.match(/```\s*([\s\S]*?)\s*```/);
        const jsonString = jsonMatch ? jsonMatch[1] : content;
        parsed = JSON.parse(jsonString);
      } else {
        parsed = content;
      }
      
      return parsed;
    } catch (error) {
      console.error('Error in LLM JSON chat:', error);
      // Если парсинг не удался, попробуем извлечь JSON из текста
      if (error instanceof SyntaxError) {
        try {
          const response = await this.client.chat.completions.create({
            model,
            messages: [
              ...messages,
              {
                role: 'system',
                content: 'Extract only valid JSON from the previous response. Return only JSON, no other text.'
              }
            ],
            temperature: 0.1
          });
          const content = response.choices[0].message.content;
          return JSON.parse(content);
        } catch (retryError) {
          throw error;
        }
      }
      throw error;
    }
  }

  // Специализированные методы для разных задач
  async generateTask(messages, options = {}) {
    return this.chatJSON(messages, {
      model: this.models.taskGeneration,
      temperature: 0.7,
      ...options
    });
  }

  async analyzeCode(messages, options = {}) {
    return this.chatJSON(messages, {
      model: this.models.codeAnalysis,
      temperature: 0.3,
      max_tokens: options.max_tokens || options.maxTokens || 400, // Уменьшено для анализа
      ...options
    });
  }

  async generateReport(messages, options = {}) {
    return this.chatJSON(messages, {
      model: this.models.report,
      temperature: 0.5,
      max_tokens: options.max_tokens || options.maxTokens || 500, // Уменьшено для отчетов
      ...options
    });
  }

  async chatDialogue(messages, options = {}) {
    return this.chat(messages, {
      model: this.models.chat,
      temperature: 0.8,
      max_tokens: options.max_tokens || options.maxTokens || 200, // Уменьшено для диалога
      ...options
    });
  }
}

export default LLMClient;

