const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
require('dotenv').config();

const app = express();

// Настройка CORS
app.use(
  cors({
    origin: [
      'https://resonant-torte-bf7a96.netlify.app',
      'http://localhost:3000',
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(express.json());

// Корневой маршрут
app.get('/', (req, res) => {
  res.status(200).json({ message: 'Добро пожаловать в API TGClips' });
});

// Инициализация Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error('Ошибка: SUPABASE_URL или SUPABASE_KEY не заданы');
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);

// Проверка подключения к Supabase
supabase
  .from('publicVideos')
  .select('url', { count: 'exact', head: true })
  .limit(0)
  .then(({ error }) => {
    if (error) {
      console.error('Ошибка проверки таблицы publicVideos:', error.message);
    } else {
      console.log('Таблица publicVideos доступна в Supabase');
    }
  })
  .catch((err) => console.error('Критическая ошибка Supabase:', err));

// Учетные данные Sightengine API
const sightengineApiUser = process.env.SIGHTENGINE_API_USER;
const sightengineApiSecret = process.env.SIGHTENGINE_API_SECRET;
console.log('Sightengine API User:', sightengineApiUser ? 'Set' : 'Not set');
console.log('Sightengine API Secret:', sightengineApiSecret ? 'Set' : 'Not set');
if (!sightengineApiUser || !sightengineApiSecret) {
  console.warn('Предупреждение: Sightengine API ключи не заданы, модерация видео недоступна');
}

// Получение публичных видео
app.get('/api/public-videos', async (req, res) => {
  try {
    console.log('Запрос /api/public-videos');
    const { data, error } = await supabase
      .from('publicVideos')
      .select('*')
      .eq('is_public', true)
      .order('timestamp', { ascending: false });

    if (error) {
      console.error('Ошибка Supabase:', error);
      throw new Error(`Supabase ошибка: ${error.message}`);
    }

    console.log(`Найдено видео: ${data.length}`);
    res.json(data);
  } catch (error) {
    console.error('Ошибка при получении видео:', error.message, error.stack);
    res.status(500).json({
      error: 'Не удалось получить видео',
      details: error.message,
    });
  }
});

// Обновление данных видео
app.post('/api/update-video', async (req, res) => {
  const {
    url,
    views = [],
    likes = 0,
    dislikes = 0,
    user_likes = [],
    user_dislikes = [],
    comments = [],
  } = req.body;

  try {
    console.log('Запрос /api/update-video:', { url, views, likes, dislikes });
    if (!url) {
      return res.status(400).json({ error: 'Поле url обязательно' });
    }

    const { data, error } = await supabase
      .from('publicVideos')
      .upsert(
        {
          url,
          views,
          likes,
          dislikes,
          user_likes,
          user_dislikes,
          comments,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'url' }
      )
      .select();

    if (error) {
      console.error('Ошибка Supabase:', error);
      throw new Error(`Supabase ошибка: ${error.message}`);
    }

    console.log('Обновлено видео:', data);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Ошибка при обновлении видео:', error.message, error.stack);
    res.status(500).json({
      error: 'Не удалось обновить видео',
      details: error.message,
    });
  }
});

// Проверка контента через Sightengine
app.post('/api/moderate-video', async (req, res) => {
  const { videoUrl } = req.body;
  if (!videoUrl) {
    return res.status(400).json({ error: 'Поле videoUrl обязательно' });
  }

  try {
    console.log('Запрос /api/moderate-video:', { videoUrl });
    const response = await axios.get('https://api.sightengine.com/1.0/video/check-sync.json', {
      params: {
        url: videoUrl,
        api_user: sightengineApiUser,
        api_secret: sightengineApiSecret,
        categories: 'nudity,violence,drugs,weapons',
      },
    });

    console.log('Ответ Sightengine:', response.data);
    res.json(response.data);
  } catch (error) {
    console.error('Ошибка при модерации видео:', error.message, error.stack);
    res.status(500).json({
      error: 'Не удалось провести модерацию видео',
      details: error.response?.data || error.message,
    });
  }
});

// Регистрация канала
app.post('/api/register-channel', async (req, res) => {
  const { telegram_id, channel_link } = req.body;
  if (!telegram_id || !channel_link) {
    return res.status(400).json({ error: 'Поля telegram_id и channel_link обязательны' });
  }

  try {
    console.log('Запрос /api/register-channel:', { telegram_id, channel_link });
    const { data, error } = await supabase
      .from('channels')
      .upsert(
        { user_id: telegram_id, channel_name: channel_link },
        { onConflict: 'user_id' }
      )
      .select();

    if (error) {
      console.error('Ошибка Supabase:', error);
      throw new Error(`Supabase ошибка: ${error.message}`);
    }

    console.log('Канал зарегистрирован:', data);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Ошибка при регистрации канала:', error.message, error.stack);
    res.status(500).json({
      error: 'Не удалось зарегистрировать канал',
      details: error.message,
    });
  }
});

// Загрузка видео
app.post('/api/upload-video', async (req, res) => {
  const { telegram_id, videoUrl, title, description } = req.body;
  if (!telegram_id || !videoUrl) {
    return res.status(400).json({ error: 'Поля telegram_id и videoUrl обязательны' });
  }

  try {
    console.log('Запрос /api/upload-video:', { telegram_id, videoUrl, title });
    const { data, error } = await supabase
      .from('publicVideos')
      .insert({
        author_id: telegram_id,
        url: videoUrl,
        title,
        description,
        is_public: true,
        views: [],
        likes: 0,
        dislikes: 0,
        user_likes: [],
        user_dislikes: [],
        comments: [],
        timestamp: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select();

    if (error) {
      console.error('Ошибка Supabase:', error);
      throw new Error(`Supabase ошибка: ${error.message}`);
    }

    console.log('Видео загружено:', data);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Ошибка при загрузке видео:', error.message, error.stack);
    res.status(500).json({
      error: 'Не удалось загрузить видео',
      details: error.message,
    });
  }
});

// Удаление видео
app.post('/api/delete-video', async (req, res) => {
  const { url, telegram_id } = req.body;
  if (!url || !telegram_id) {
    return res.status(400).json({ error: 'Поля url и telegram_id обязательны' });
  }

  try {
    console.log('Запрос /api/delete-video:', { url, telegram_id });
    const { data, error } = await supabase
      .from('publicVideos')
      .delete()
      .eq('url', url)
      .eq('author_id', telegram_id)
      .select();

    if (error) {
      console.error('Ошибка Supabase:', error);
      throw new Error(`Supabase ошибка: ${error.message}`);
    }

    console.log('Видео удалено:', data);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Ошибка при удалении видео:', error.message, error.stack);
    res.status(500).json({
      error: 'Не удалось удалить видео',
      details: error.message,
    });
  }
});

// Обработка ошибок для несуществующих маршрутов
app.use((req, res) => {
  res.status(404).json({ error: 'Маршрут не найден' });
});

// Глобальный обработчик ошибок
app.use((err, req, res, next) => {
  console.error('Глобальная ошибка:', err.message, err.stack);
  res.status(500).json({
    error: 'Произошла ошибка сервера',
    details: err.message,
  });
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
