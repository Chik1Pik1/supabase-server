require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');

const app = express();

// Настройка CORS
app.use(cors());
app.use(express.json());

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

// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
