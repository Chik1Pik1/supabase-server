require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');

const app = express();

// Настройка multer для обработки файлов
const upload = multer({ storage: multer.memoryStorage() });

// Настройка CORS
app.use(cors());
app.use(express.json());

// Инициализация Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Ошибка: SUPABASE_URL или SUPABASE_KEY не определены');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Настройка Sightengine
const sightengineApiUser = process.env.SIGHTENGINE_API_USER;
const sightengineApiSecret = process.env.SIGHTENGINE_API_SECRET;

if (!sightengineApiUser || !sightengineApiSecret) {
    console.error('Ошибка: SIGHTENGINE_API_USER или SIGHTENGINE_API_SECRET не определены');
    process.exit(1);
}

// Функция для модерации видео через Sightengine
async function moderateVideo(file) {
    try {
        const formData = new FormData();
        formData.append('media', file.buffer, {
            filename: file.originalname,
            contentType: file.mimetype,
        });
        formData.append('models', 'nudity-2.1,offensive,weapon,gore-2.0');
        formData.append('api_user', sightengineApiUser);
        formData.append('api_secret', sightengineApiSecret);

        const response = await axios.post('https://api.sightengine.com/1.0/video/check-sync.json', formData, {
            headers: {
                ...formData.getHeaders(),
            },
        });

        const result = response.data;
        console.log('Sightengine result:', result);

        // Проверяем, есть ли нежелательный контент
        const hasNudity = result.summary?.nudity?.raw > 0.5;
        const hasOffensive = result.summary?.offensive?.prob > 0.5;
        const hasWeapon = result.summary?.weapon > 0.5;
        const hasGore = result.summary?.gore?.prob > 0.5;

        if (hasNudity || hasOffensive || hasWeapon || hasGore) {
            throw new Error('Видео не прошло модерацию: обнаружен нежелательный контент');
        }

        return { success: true };
    } catch (error) {
        console.error('Ошибка модерации:', error.message);
        throw error;
    }
}

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

        console.log('GET /api/public-videos - Видео из базы:', data);
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

        console.log('POST /api/update-video - Успешно обновлено:', data);
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

        console.log('POST /api/delete-video - Успешно удалено:', url);
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

// Загрузка видео с модерацией
app.post('/api/upload-video', upload.single('file'), async (req, res) => {
    const { telegram_id, description } = req.body;

    if (!telegram_id || !req.file) {
        return res.status(400).json({ error: 'Не указан telegram_id или файл видео' });
    }

    try {
        // Модерация видео через Sightengine
        await moderateVideo(req.file);

        // Загружаем видео в Supabase Storage
        const fileName = `${telegram_id}_${Date.now()}.mp4`;
        const { error: storageError } = await supabase.storage
            .from('videos')
            .upload(fileName, req.file.buffer, {
                contentType: req.file.mimetype,
            });

        if (storageError) throw storageError;

        const videoUrl = `${supabaseUrl}/storage/v1/object/public/videos/${fileName}`;

        // Сохраняем метаданные в таблицу publicVideos
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

        console.log('POST /api/upload-video - Успешно загружено:', data);
        res.json({ message: 'Видео успешно загружено', url: videoUrl });
    } catch (error) {
        console.error('POST /api/upload-video - Ошибка:', error.message);
        res.status(500).json({ error: error.message || 'Ошибка загрузки видео' });
    }
});

// Скачивание видео
app.get('/api/download-video', async (req, res) => {
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'Не указан URL видео' });
    }

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Ошибка загрузки видео');

        const fileName = url.split('/').pop() || `video_${Date.now()}.mp4`;
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Content-Type', response.headers.get('content-type') || 'video/mp4');

        response.body.pipe(res);
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