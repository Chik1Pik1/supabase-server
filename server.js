const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();

// Настройка CORS
app.use(cors({
    origin: [
        'https://resonant-torte-bf7a96.netlify.app',
        'http://localhost:3000',
        'https://web.telegram.org'
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true
}));

app.options('*', cors());

// Парсинг JSON и URL-encoded данных
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Логирование всех входящих запросов
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Инициализация Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
if (!supabaseUrl || !supabaseKey) {
    console.error('Ошибка: Не заданы SUPABASE_URL или SUPABASE_KEY');
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
            console.log('Таблица publicVideos успешно подключена');
        }
    })
    .catch(err => console.error('Критическая ошибка Supabase:', err));

// Корневой маршрут
app.get('/', (req, res) => {
    res.status(200).json({ message: 'TGClips API is running' });
});

// Получение публичных видео
app.get('/api/public-videos', async (req, res) => {
    try {
        console.log('Запрос на /api/public-videos');
        const { data, error } = await supabase
            .from('publicVideos')
            .select('*')
            .eq('is_public', true)
            .order('timestamp', { ascending: false });

        if (error) {
            console.error('Supabase error:', error.message);
            throw new Error(error.message);
        }

        console.log(`Возвращено ${data.length} видео`);
        res.status(200).json(data);
    } catch (error) {
        console.error('Ошибка /api/public-videos:', error.message, error.stack);
        res.status(500).json({
            error: 'Failed to fetch videos',
            details: error.message
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
        shares = 0,
        view_time = 0,
        replays = 0,
        duration = 0,
        last_position = 0,
        chat_messages = [],
        description = ''
    } = req.body;

    if (!url) {
        console.warn('Отсутствует url в /api/update-video');
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        console.log('Запрос на /api/update-video:', { url, views, likes, dislikes });
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
                    shares,
                    view_time,
                    replays,
                    duration,
                    last_position,
                    chat_messages,
                    description,
                    updated_at: new Date().toISOString()
                },
                { onConflict: 'url' }
            )
            .select();

        if (error) {
            console.error('Supabase error:', error.message);
            throw new Error(error.message);
        }

        console.log('Видео обновлено:', data);
        res.status(200).json({ success: true, data });
    } catch (error) {
        console.error('Ошибка /api/update-video:', error.message, error.stack);
        res.status(500).json({
            error: 'Failed to update video',
            details: error.message
        });
    }
});

// Регистрация канала
app.post('/api/register-channel', async (req, res) => {
    const { telegram_id, channel_link } = req.body;
    if (!telegram_id || !channel_link) {
        console.warn('Отсутствует telegram_id или channel_link в /api/register-channel');
        return res.status(400).json({ error: 'telegram_id and channel_link are required' });
    }

    try {
        console.log('Запрос на /api/register-channel:', { telegram_id, channel_link });
        const { data, error } = await supabase
            .from('channels')
            .upsert(
                { user_id: telegram_id, channel_name: channel_link },
                { onConflict: 'user_id' }
            )
            .select();

        if (error) {
            console.error('Supabase error:', error.message);
            throw new Error(error.message);
        }

        console.log('Канал зарегистрирован:', data);
        res.status(200).json({ success: true, data });
    } catch (error) {
        console.error('Ошибка /api/register-channel:', error.message, error.stack);
        res.status(500).json({
            error: 'Failed to register channel',
            details: error.message
        });
    }
});

// Загрузка видео
app.post('/api/upload-video', async (req, res) => {
    const { telegram_id, videoUrl, title = '', description = '' } = req.body;
    if (!telegram_id || !videoUrl) {
        console.warn('Отсутствует telegram_id или videoUrl в /api/upload-video');
        return res.status(400).json({ error: 'telegram_id and videoUrl are required' });
    }

    try {
        console.log('Запрос на /api/upload-video:', { telegram_id, videoUrl, title, description });
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
                shares: 0,
                view_time: 0,
                replays: 0,
                duration: 0,
                last_position: 0,
                chat_messages: [],
                timestamp: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .select();

        if (error) {
            console.error('Supabase error:', error.message);
            throw new Error(error.message);
        }

        console.log('Видео загружено:', data);
        res.status(200).json({ success: true, data });
    } catch (error) {
        console.error('Ошибка /api/upload-video:', error.message, error.stack);
        res.status(500).json({
            error: 'Failed to upload video',
            details: error.message
        });
    }
});

// Удаление видео
app.post('/api/delete-video', async (req, res) => {
    const { url, telegram_id } = req.body;
    if (!url || !telegram_id) {
        console.warn('Отсутствует url или telegram_id в /api/delete-video');
        return res.status(400).json({ error: 'url and telegram_id are required' });
    }

    try {
        console.log('Запрос на /api/delete-video:', { url, telegram_id });
        const { data, error } = await supabase
            .from('publicVideos')
            .delete()
            .eq('url', url)
            .eq('author_id', telegram_id)
            .select();

        if (error) {
            console.error('Supabase error:', error.message);
            throw new Error(error.message);
        }

        console.log('Видео удалено:', data);
        res.status(200).json({ success: true, data });
    } catch (error) {
        console.error('Ошибка /api/delete-video:', error.message, error.stack);
        res.status(500).json({
            error: 'Failed to delete video',
            details: error.message
        });
    }
});

// Обработка несуществующих маршрутов
app.use((req, res) => {
    console.warn(`Маршрут не найден: ${req.method} ${req.url}`);
    res.status(404).json({ error: 'Route not found' });
});

// Глобальный обработчик ошибок
app.use((err, req, res, next) => {
    console.error('Server error:', err.message, err.stack);
    res.status(500).json({
        error: 'Server error',
        details: err.message
    });
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
