const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
const multer = require('multer');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Настройка CORS
app.use(cors({
  origin: [
    'https://resonant-torte-bf7a96.netlify.app',
    'https://*.telegram.org',
    'http://localhost:3000' // Для локальной разработки
  ],
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type']
}));

// Middleware для парсинга JSON
app.use(express.json());

// Настройка Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Настройка Multer для обработки загрузки файлов
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 } // 100 MB
});

// Эндпоинт для получения публичных видео
app.get('/api/public-videos', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('publicVideos')
      .select('*')
      .order('timestamp', { ascending: false });
    if (error) {
      console.error('GET /api/public-videos - Ошибка Supabase:', error.message);
      return res.status(500).json({ error: 'Ошибка получения видео' });
    }
    console.log('GET /api/public-videos - Успешно:', data.length, 'видео');
    res.json(data);
  } catch (error) {
    console.error('GET /api/public-videos - Неожиданная ошибка:', error.message);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Эндпоинт для загрузки видео
app.post('/api/upload-video', upload.single('file'), async (req, res) => {
  const { telegram_id, description } = req.body;
  if (!req.file || !telegram_id) {
    return res.status(400).json({ error: 'Файл и telegram_id обязательны' });
  }

  try {
    const fileName = `${telegram_id}_${Date.now()}${path.extname(req.file.originalname)}`;
    const { error: uploadError } = await supabase.storage
      .from('videos')
      .upload(fileName, req.file.buffer, {
        contentType: req.file.mimetype
      });

    if (uploadError) {
      console.error('POST /api/upload-video - Ошибка загрузки в Supabase:', uploadError.message);
      return res.status(500).json({ error: 'Ошибка загрузки видео' });
    }

    const { data: publicUrlData } = supabase.storage
      .from('videos')
      .getPublicUrl(fileName);

    if (!publicUrlData.publicUrl) {
      console.error('POST /api/upload-video - Не удалось получить публичный URL');
      return res.status(500).json({ error: 'Ошибка получения URL видео' });
    }

    const videoData = {
      url: publicUrlData.publicUrl,
      telegram_id,
      description: description || '',
      views: [],
      likes: 0,
      dislikes: 0,
      user_likes: [],
      user_dislikes: [],
      comments: [],
      shares: 0,
      view_time: 0,
      replays: 0,
      duration: 0,
      last_position: 0,
      chat_messages: [],
      timestamp: new Date().toISOString()
    };

    const { error: insertError } = await supabase
      .from('publicVideos')
      .insert([videoData]);

    if (insertError) {
      console.error('POST /api/upload-video - Ошибка вставки в Supabase:', insertError.message);
      return res.status(500).json({ error: 'Ошибка сохранения данных видео' });
    }

    console.log('POST /api/upload-video - Видео успешно загружено:', publicUrlData.publicUrl);
    res.json({ url: publicUrlData.publicUrl });
  } catch (error) {
    console.error('POST /api/upload-video - Неожиданная ошибка:', error.message);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Эндпоинт для скачивания видео
app.get('/api/download-video', async (req, res) => {
  const { url } = req.query;
  if (!url) {
    console.error('GET /api/download-video - Не указан URL');
    return res.status(400).json({ error: 'Не указан URL видео' });
  }

  try {
    const fileName = url.split('/').pop();
    const { data } = supabase.storage
      .from('videos')
      .getPublicUrl(fileName);

    if (!data.publicUrl) {
      console.error('GET /api/download-video - Не удалось получить публичный URL');
      return res.status(500).json({ error: 'Ошибка получения URL видео' });
    }

    console.log('GET /api/download-video - Перенаправление на:', data.publicUrl);
    res.redirect(data.publicUrl);
  } catch (error) {
    console.error('GET /api/download-video - Неожиданная ошибка:', error.message);
    res.status(500).json({ error: 'Ошибка скачивания видео' });
  }
});

// Эндпоинт для получения ссылки на канал
app.get('/api/get-channel', async (req, res) => {
  const { telegram_id } = req.query;
  if (!telegram_id) {
    console.error('GET /api/get-channel - Не указан telegram_id');
    return res.status(400).json({ error: 'Не указан telegram_id' });
  }

  try {
    const { data, error } = await supabase
      .from('users')
      .select('channel_link')
      .eq('telegram_id', telegram_id)
      .single();

    if (error) {
      console.error('GET /api/get-channel - Ошибка Supabase:', error.message);
      return res.status(500).json({ error: 'Ошибка получения канала' });
    }

    if (!data) {
      console.log('GET /api/get-channel - Канал не найден для telegram_id:', telegram_id);
      return res.status(404).json({ error: 'Канал не найден' });
    }

    console.log('GET /api/get-channel - Успешно:', data.channel_link);
    res.json({ channel_link: data.channel_link });
  } catch (error) {
    console.error('GET /api/get-channel - Неожиданная ошибка:', error.message);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Эндпоинт для регистрации канала
app.post('/api/register-channel', async (req, res) => {
  const { telegram_id, channel_link } = req.body;
  if (!telegram_id || !channel_link) {
    console.error('POST /api/register-channel - Не указаны telegram_id или channel_link');
    return res.status(400).json({ error: 'Не указаны telegram_id или channel_link' });
  }

  if (!channel_link.match(/^https:\/\/t\.me\/[a-zA-Z0-9_]+$/)) {
    console.error('POST /api/register-channel - Некорректная ссылка:', channel_link);
    return res.status(400).json({ error: 'Некорректная ссылка на канал' });
  }

  try {
    const { data: existingUser, error: selectError } = await supabase
      .from('users')
      .select('telegram_id')
      .eq('telegram_id', telegram_id)
      .single();

    if (selectError && selectError.code !== 'PGRST116') {
      console.error('POST /api/register-channel - Ошибка проверки пользователя:', selectError.message);
      return res.status(500).json({ error: 'Ошибка сервера' });
    }

    if (existingUser) {
      const { error: updateError } = await supabase
        .from('users')
        .update({ channel_link })
        .eq('telegram_id', telegram_id);

      if (updateError) {
        console.error('POST /api/register-channel - Ошибка обновления:', updateError.message);
        return res.status(500).json({ error: 'Ошибка обновления канала' });
      }
      console.log('POST /api/register-channel - Канал обновлён:', channel_link);
    } else {
      const { error: insertError } = await supabase
        .from('users')
        .insert([{ telegram_id, channel_link }]);

      if (insertError) {
        console.error('POST /api/register-channel - Ошибка вставки:', insertError.message);
        return res.status(500).json({ error: 'Ошибка регистрации канала' });
      }
      console.log('POST /api/register-channel - Канал зарегистрирован:', channel_link);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('POST /api/register-channel - Неожиданная ошибка:', error.message);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Эндпоинт для обновления данных видео
app.post('/api/update-video', async (req, res) => {
  const {
    url,
    views,
    likes,
    dislikes,
    user_likes,
    user_dislikes,
    comments,
    shares,
    view_time,
    replays,
    duration,
    last_position,
    chat_messages,
    description
  } = req.body;

  if (!url) {
    console.error('POST /api/update-video - Не указан URL');
    return res.status(400).json({ error: 'Не указан URL видео' });
  }

  try {
    const { error } = await supabase
      .from('publicVideos')
      .update({
        views,
        likes,
        dislikes,
        user_likes,
        user_dislikes,
        comments,
        shares,
        view_time,
        replays,
        duration,
        last_position,
        chat_messages,
        description
      })
      .eq('url', url);

    if (error) {
      console.error('POST /api/update-video - Ошибка Supabase:', error.message);
      return res.status(500).json({ error: 'Ошибка обновления данных видео' });
    }

    console.log('POST /api/update-video - Данные видео обновлены:', url);
    res.json({ success: true });
  } catch (error) {
    console.error('POST /api/update-video - Неожиданная ошибка:', error.message);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Эндпоинт для удаления видео
app.post('/api/delete-video', async (req, res) => {
  const { url, telegram_id } = req.body;
  if (!url || !telegram_id) {
    console.error('POST /api/delete-video - Не указаны url или telegram_id');
    return res.status(400).json({ error: 'Не указаны URL или telegram_id' });
  }

  try {
    const { data: video, error: selectError } = await supabase
      .from('publicVideos')
      .select('telegram_id')
      .eq('url', url)
      .single();

    if (selectError) {
      console.error('POST /api/delete-video - Ошибка проверки видео:', selectError.message);
      return res.status(500).json({ error: 'Ошибка сервера' });
    }

    if (!video) {
      console.error('POST /api/delete-video - Видео не найдено:', url);
      return res.status(404).json({ error: 'Видео не найдено' });
    }

    if (video.telegram_id !== telegram_id) {
      console.error('POST /api/delete-video - Доступ запрещён:', telegram_id);
      return res.status(403).json({ error: 'Доступ запрещён' });
    }

    const fileName = url.split('/').pop();
    const { error: storageError } = await supabase.storage
      .from('videos')
      .remove([fileName]);

    if (storageError) {
      console.error('POST /api/delete-video - Ошибка удаления файла:', storageError.message);
      return res.status(500).json({ error: 'Ошибка удаления файла' });
    }

    const { error: deleteError } = await supabase
      .from('publicVideos')
      .delete()
      .eq('url', url);

    if (deleteError) {
      console.error('POST /api/delete-video - Ошибка удаления записи:', deleteError.message);
      return res.status(500).json({ error: 'Ошибка удаления видео' });
    }

    console.log('POST /api/delete-video - Видео удалено:', url);
    res.json({ success: true });
  } catch (error) {
    console.error('POST /api/delete-video - Неожиданная ошибка:', error.message);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Обработка ошибок
app.use((err, req, res, next) => {
  console.error('Глобальная ошибка:', err.stack);
  res.status(500).json({ error: 'Что-то пошло не так!' });
});

// Запуск сервера
app.listen(port, () => {
  console.log(`Сервер запущен на порту ${port}`);
});
