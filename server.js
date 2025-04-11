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

// Запуск сервера на порту из переменной окружения (для Koyeb)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
