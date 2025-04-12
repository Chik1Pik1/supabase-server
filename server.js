require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
const multer = require('multer');
const path = require('path');

const app = express();

// Настройка CORS
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // Для раздачи фронтенда

// Настройка Multer для обработки файлов
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // Лимит 100 МБ
});

// Инициализация Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Ошибка: SUPABASE_URL или SUPABASE_SERVICE_KEY не определены');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Тестовый маршрут
app.get('/', (req, res) => {
  res.send('Supabase сервер работает!');
});

// Получение публичных видео
app.get('/api/public-videos', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('publicVideos')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(10);

    if (error) throw error;
    console.log('GET /api/public-videos - Видео:', data);
    res.json(data);
  } catch (error) {
    console.error('GET /api/public-videos - Ошибка:', error.message);
    res.status(500).json({ error: 'Не удалось загрузить видео' });
  }
});

// Регистрация канала
app.post('/api/register-channel', async (req, res) => {
  const { telegram_id, channel_link } = req.body;

  if (!telegram_id || !channel_link) {
    return res.status(400).json({ error: 'Не указан telegram_id или channel_link' });
  }

  try {
    const { data, error } = await supabase
      .from('users')
      .upsert({ telegram_id, channel_link }, { onConflict: 'telegram_id' })
      .select();

    if (error) throw error;
    console.log('POST /api/register-channel - Успешно:', data);
    res.json({ message: 'Канал успешно зарегистрирован', data });
  } catch (error) {
    console.error('POST /api/register-channel - Ошибка:', error.message);
    res.status(500).json({ error: 'Ошибка при регистрации канала' });
  }
});

// Обновление данных видео
app.post('/api/update-video', async (req, res) => {
  const {
    url, views, likes, dislikes, user_likes, user_dislikes, comments,
    shares, view_time, replays, duration, last_position, chat_messages, description
  } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'Не указан URL видео' });
  }

  try {
    const { data, error } = await supabase
      .from('publicVideos')
      .upsert({
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
        description,
        timestamp: new Date().toISOString()
      }, { onConflict: 'url' })
      .select();

    if (error) throw error;
    console.log('POST /api/update-video - Успешно:', data);
    res.json({ message: 'Данные видео обновлены', data });
  } catch (error) {
    console.error('POST /api/update-video - Ошибка:', error.message);
    res.status(500).json({ error: 'Ошибка обновления видео' });
  }
});

// Удаление видео
app.post('/api/delete-video', async (req, res) => {
  const { url, telegram_id } = req.body;
  if (!url || !telegram_id) {
    return res.status(400).json({ error: 'Не указан url или telegram_id' });
  }

  try {
    const { error: deleteDbError } = await supabase
      .from('publicVideos')
      .delete()
      .eq('url', url)
      .eq('author_id', telegram_id);
    if (deleteDbError) throw deleteDbError;

    const fileName = url.split('/videos/')[1];
    const { error: deleteStorageError } = await supabase.storage
      .from('videos')
      .remove([fileName]);
    if (deleteStorageError) throw deleteStorageError;

    console.log('POST /api/delete-video - Успешно:', url);
    res.json({ message: 'Видео успешно удалено' });
  } catch (error) {
    console.error('POST /api/delete-video - Ошибка:', error.message);
    res.status(500).json({ error: 'Ошибка удаления видео' });
  }
});

// Получение ссылки на канал
app.get('/api/get-channel', async (req, res) => {
  const { telegram_id } = req.query;

  if (!telegram_id) {
    return res.status(400).json({ error: 'Не указан telegram_id' });
  }

  try {
    const { data, error } = await supabase
      .from('users')
      .select('channel_link')
      .eq('telegram_id', telegram_id)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Канал не найден' });

    console.log('GET /api/get-channel - Успешно:', data);
    res.json({ channel_link: data.channel_link });
  } catch (error) {
    console.error('GET /api/get-channel - Ошибка:', error.message);
    res.status(500).json({ error: 'Ошибка получения канала' });
  }
});

// Загрузка видео с публичным доступом
app.post('/api/upload-video', upload.single('file'), async (req, res) => {
  const { telegram_id, description } = req.body;

  if (!telegram_id || !req.file) {
    return res.status(400).json({ error: 'Не указан telegram_id или файл видео' });
  }

  try {
    // Генерация уникального имени файла
    const fileName = `${telegram_id}_${Date.now()}.mp4`;

    // Загрузка видео в Supabase Storage
    const { error: storageError } = await supabase.storage
      .from('videos')
      .upload(fileName, req.file.buffer, {
        contentType: req.file.mimetype,
        cacheControl: '3600',
        upsert: false,
      });

    if (storageError) throw storageError;

    // Получение публичного URL
    const { data: publicUrlData } = supabase.storage
      .from('videos')
      .getPublicUrl(fileName);

    const videoUrl = publicUrlData.publicUrl;

    // Сохранение метаданных в таблицу publicVideos
    const { data, error } = await supabase
      .from('publicVideos')
      .insert({
        url: videoUrl,
        author_id: telegram_id,
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
      })
      .select()
      .single();

    if (error) throw error;

    console.log('POST /api/upload-video - Успешно:', data);
    res.json({ message: 'Видео успешно загружено', url: videoUrl });
  } catch (error) {
    console.error('POST /api/upload-video - Ошибка:', error.message);
    res.status(500).json({ error: 'Ошибка загрузки видео' });
  }
});

// Скачивание видео
app.get('/api/download-video', async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'Не указан URL видео' });
  }

  try {
    // Извлечение имени файла из URL
    const fileName = url.split('/').pop();
    const { data: publicUrlData } = supabase.storage
      .from('videos')
      .getPublicUrl(fileName);

    if (!publicUrlData.publicUrl) {
      throw new Error('Не удалось получить публичный URL');
    }

    // Перенаправление на публичный URL
    res.redirect(publicUrlData.publicUrl);
  } catch (error) {
    console.error('GET /api/download-video - Ошибка:', error.message);
    res.status(500).json({ error: 'Ошибка скачивания видео' });
  }
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
