require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');

const app = express();

// Настройка CORS для разрешения запросов с фронтенда
app.use(cors());
app.use(express.json()); // Парсинг JSON-запросов

// Инициализация Supabase с переменными окружения
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Ошибка: SUPABASE_URL или SUPABASE_SERVICE_KEY не определены');
    process.exit(1); // Завершаем процесс, если переменные отсутствуют
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Маршрут для проверки работы сервера
app.get('/', (req, res) => {
    res.send('Supabase сервер работает!');
});

// Маршрут для получения списка публичных видео
app.get('/api/public-videos', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('publicVideos')
            .select('*')
            .order('timestamp', { ascending: false })
            .limit(10);

        if (error) throw error;

        console.log('Видео из базы:', data); // Логируем данные для отладки
        res.json(data);
    } catch (error) {
        console.error('Ошибка получения видео:', error.message);
        res.status(500).json({ error: 'Не удалось загрузить видео' });
    }
});

// Маршрут для регистрации канала
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

        res.json({ message: 'Канал успешно зарегистрирован', data });
    } catch (error) {
        console.error('Ошибка регистрации канала:', error.message);
        res.status(500).json({ error: 'Ошибка при регистрации канала' });
    }
});

// Маршрут для обновления данных видео
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
                timestamp: new Date().toISOString() // Обновляем время
            }, { onConflict: 'url' })
            .select();

        if (error) throw error;

        console.log('Видео обновлено:', data); // Логируем для отладки
        res.json({ message: 'Данные видео обновлены', data });
    } catch (error) {
        console.error('Ошибка обновления видео:', error.message);
        res.status(500).json({ error: 'Ошибка обновления видео' });
    }
});

// Маршрут для удаления видео
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

        res.json({ message: 'Видео успешно удалено' });
    } catch (error) {
        console.error('Ошибка удаления видео:', error.message);
        res.status(500).json({ error: 'Ошибка удаления видео' });
    }
});

// Запуск сервера на порту из переменной окружения (для Koyeb)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
