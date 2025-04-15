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

// Инициализация Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Sightengine API credentials
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
        console.error('Error fetching videos:', error);
        res.status(500).json({ error: 'Failed to fetch videos' });
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
        console.error('Error updating video:', error);
        res.status(500).json({ error: 'Failed to update video' });
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
        console.error('Error moderating video:', error);
        res.status(500).json({ error: 'Failed to moderate video' });
    }
});

// Регистрация канала
app.post('/api/register-channel', async (req, res) => {
    const { userId, channelName } = req.body;
    try {
        const { data, error } = await supabase
            .from('channels')
            .upsert({ user_id: userId, channel_name: channelName });

        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) {
        console.error('Error registering channel:', error);
        res.status(500).json({ error: 'Failed to register channel' });
    }
});

// Загрузка видео
app.post('/api/upload-video', async (req, res) => {
    const { userId, videoUrl, title, description } = req.body;
    try {
        const { data, error } = await supabase
            .from('videos')
            .insert({
                user_id: userId,
                url: videoUrl,
                title,
                description,
                is_public: false,
                created_at: new Date().toISOString()
            });

        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) {
        console.error('Error uploading video:', error);
        res.status(500).json({ error: 'Failed to upload video' });
    }
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
