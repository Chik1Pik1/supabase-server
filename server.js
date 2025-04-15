const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
require('dotenv').config();

const app = express();

// Настройка CORS
app.use(cors({
    origin: 'https://resonant-torte-bf7a96.netlify.app',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Корневой маршрут для предотвращения ошибки "Cannot GET /"
app.get('/', (req, res) => {
    res.status(200).json({ message: 'Добро пожаловать в API TGClips' });
});

// Инициализация Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Учетные данные Sightengine API
const sightengineApiUser = process.env.SIGHTENGINE_API_USER;
const sightengineApiSecret = process.env.SIGHTENGINE_API_SECRET;

// Получение публичных видео
app.get('/api/public-videos', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('videos')
            .select('*')
            .eq('is_public', true)
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(data);
    } catch (error) {
        console.error('Ошибка при получении видео:', error);
        res.status(500).json({ error: 'Не удалось получить видео' });
    }
});

// Обновление данных видео
app.post('/api/update-video', async (req, res) => {
    const { url, views, likes, dislikes, user_likes, user_dislikes, comments } = req.body;
    try {
        const { data, error } = await supabase
            .from('videos')
            .update({
                views,
                likes,
                dislikes,
                user_likes,
                user_dislikes,
                comments,
                updated_at: new Date().toISOString()
            })
            .eq('url', url);

        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) {
        console.error('Ошибка при обновлении видео:', error);
        res.status(500).json({ error: 'Не удалось обновить видео' });
    }
});

// Проверка контента через Sightengine
app.post('/api/moderate-video', async (req, res) => {
    const { videoUrl } = req.body;
    try {
        const response = await axios.get('https://api.sightengine.com/1.0/video/check.json', {
            params: {
                url: videoUrl,
                api_user: sightengineApiUser,
                api_secret: sightengineApiSecret,
                categories: 'nudity,violence,drugs,weapons'
            }
        });
        res.json(response.data);
    } catch (error) {
        console.error('Ошибка при модерации видео:', error);
        res.status(500).json({ error: 'Не удалось провести модерацию видео' });
    }
});

// Регистрация канала
app.post('/api/register-channel', async (req, res) => {
    const { telegram_id, channel_link } = req.body;
    try {
        const { data, error } = await supabase
            .from('channels')
            .upsert({ user_id: telegram_id, channel_name: channel_link });

        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) {
        console.error('Ошибка при регистрации канала:', error);
        res.status(500).json({ error: 'Не удалось зарегистрировать канал' });
    }
});

// Загрузка видео
app.post('/api/upload-video', async (req, res) => {
    const { telegram_id, videoUrl, title, description } = req.body;
    try {
        const { data, error } = await supabase
            .from('videos')
            .insert({
                user_id: telegram_id,
                url: videoUrl,
                title,
                description,
                is_public: false,
                created_at: new Date().toISOString()
            });

        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) {
        console.error('Ошибка при загрузке видео:', error);
        res.status(500).json({ error: 'Не удалось загрузить видео' });
    }
});

// Удаление видео
app.post('/api/delete-video', async (req, res) => {
    const { url, telegram_id } = req.body;
    try {
        const { data, error } = await supabase
            .from('videos')
            .delete()
            .eq('url', url)
            .eq('user_id', telegram_id);

        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) {
        console.error('Ошибка при удалении видео:', error);
        res.status(500).json({ error: 'Не удалось удалить видео' });
    }
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
