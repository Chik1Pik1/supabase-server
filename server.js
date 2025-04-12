const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000;

// Настройка CORS
app.use(cors({
    origin: '*', // Разрешить все источники (для тестирования). В продакшене укажи конкретные домены, например, ['http://localhost:3000', 'https://resonant-torte-bf7a96.netlify.app']
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Accept']
}));

// Парсинг JSON и URL-encoded тел
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Логирование запросов для диагностики
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Проверка переменных окружения
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Ошибка: SUPABASE_URL или SUPABASE_SERVICE_KEY не заданы');
    process.exit(1);
}

// Инициализация Supabase
const supabase = createClient(supabaseUrl, supabaseKey);

// Настройка Multer для загрузки видео
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, `${uniqueSuffix}-${file.originalname}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 100 * 1024 * 1024 }, // Максимум 100 МБ
    fileFilter: (req, file, cb) => {
        const validTypes = ['video/mp4', 'video/quicktime', 'video/webm'];
        if (validTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Неподдерживаемый формат файла. Используйте MP4, MOV или WebM.'));
        }
    }
});

// Обслуживание статических файлов (например, /assets/sample-video.mp4)
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// Маршрут для проверки работоспособности сервера
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Маршрут для получения списка публичных видео
app.get('/api/public-videos', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('videos')
            .select('*')
            .eq('is_public', true)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Ошибка получения видео:', error);
            return res.status(500).json({ error: 'Ошибка базы данных', details: error.message });
        }

        if (!data || data.length === 0) {
            console.warn('Видео не найдены');
            return res.status(200).json([]);
        }

        console.log(`Возвращено ${data.length} видео`);
        res.status(200).json(data);
    } catch (error) {
        console.error('Критическая ошибка /api/public-videos:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера', details: error.message });
    }
});

// Маршрут для обновления данных видео
app.post('/api/update-video', async (req, res) => {
    try {
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
            return res.status(400).json({ error: 'URL видео обязателен' });
        }

        const { data, error } = await supabase
            .from('videos')
            .update({
                views: views || [],
                likes: likes || 0,
                dislikes: dislikes || 0,
                user_likes: user_likes || [],
                user_dislikes: user_dislikes || [],
                comments: comments || [],
                shares: shares || 0,
                view_time: view_time || 0,
                replays: replays || 0,
                duration: duration || 0,
                last_position: last_position || 0,
                chat_messages: chat_messages || [],
                description: description || '',
                updated_at: new Date().toISOString()
            })
            .eq('url', url)
            .select();

        if (error) {
            console.error('Ошибка обновления видео:', error);
            return res.status(500).json({ error: 'Ошибка базы данных', details: error.message });
        }

        if (!data || data.length === 0) {
            console.warn(`Видео с URL ${url} не найдено`);
            return res.status(404).json({ error: 'Видео не найдено' });
        }

        console.log(`Видео ${url} обновлено`);
        res.status(200).json(data[0]);
    } catch (error) {
        console.error('Критическая ошибка /api/update-video:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера', details: error.message });
    }
});

// Маршрут для регистрации канала
app.post('/api/register-channel', async (req, res) => {
    try {
        const { telegram_id, channel_link } = req.body;

        if (!telegram_id || !channel_link) {
            return res.status(400).json({ error: 'telegram_id и channel_link обязательны' });
        }

        if (!channel_link.match(/^https:\/\/t\.me\/[a-zA-Z0-9_]+$/)) {
            return res.status(400).json({ error: 'Некорректная ссылка на канал' });
        }

        const { data, error } = await supabase
            .from('users')
            .upsert(
                { telegram_id, channel_link, updated_at: new Date().toISOString() },
                { onConflict: ['telegram_id'] }
            )
            .select();

        if (error) {
            console.error('Ошибка регистрации канала:', error);
            return res.status(500).json({ error: 'Ошибка базы данных', details: error.message });
        }

        console.log(`Канал для telegram_id ${telegram_id} зарегистрирован`);
        res.status(200).json(data[0]);
    } catch (error) {
        console.error('Критическая ошибка /api/register-channel:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера', details: error.message });
    }
});

// Маршрут для загрузки видео
app.post('/api/upload-video', upload.single('file'), async (req, res) => {
    try {
        const { telegram_id, description } = req.body;
        const file = req.file;

        if (!telegram_id || !file) {
            return res.status(400).json({ error: 'telegram_id и файл обязательны' });
        }

        // Загрузка файла в Supabase Storage
        const filePath = `videos/${telegram_id}/${file.filename}`;
        const fileBuffer = fs.readFileSync(file.path);

        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('videos')
            .upload(filePath, fileBuffer, {
                contentType: file.mimetype,
                upsert: true
            });

        if (uploadError) {
            console.error('Ошибка загрузки в Supabase Storage:', uploadError);
            return res.status(500).json({ error: 'Ошибка загрузки файла', details: uploadError.message });
        }

        // Получение публичного URL
        const { publicUrl } = supabase.storage.from('videos').getPublicUrl(filePath);

        // Сохранение метаданных в таблице videos
        const { data, error } = await supabase
            .from('videos')
            .insert({
                url: publicUrl,
                author_id: telegram_id,
                description: description || '',
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
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .select();

        if (error) {
            console.error('Ошибка сохранения видео:', error);
            return res.status(500).json({ error: 'Ошибка базы данных', details: error.message });
        }

        // Удаление временного файла
        fs.unlinkSync(file.path);

        console.log(`Видео загружено: ${publicUrl}`);
        res.status(200).json({ url: publicUrl, video: data[0] });
    } catch (error) {
        console.error('Критическая ошибка /api/upload-video:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера', details: error.message });
    }
});

// Маршрут для удаления видео
app.post('/api/delete-video', async (req, res) => {
    try {
        const { url, telegram_id } = req.body;

        if (!url || !telegram_id) {
            return res.status(400).json({ error: 'url и telegram_id обязательны' });
        }

        // Проверка прав на удаление
        const { data: video, error: fetchError } = await supabase
            .from('videos')
            .select('author_id')
            .eq('url', url)
            .single();

        if (fetchError || !video) {
            console.error('Видео не найдено или ошибка:', fetchError);
            return res.status(404).json({ error: 'Видео не найдено' });
        }

        if (video.author_id !== telegram_id) {
            return res.status(403).json({ error: 'Нет прав для удаления этого видео' });
        }

        // Удаление из Supabase Storage
        const filePath = url.split('/storage/v1/object/public/videos/')[1];
        if (filePath) {
            const { error: storageError } = await supabase.storage
                .from('videos')
                .remove([filePath]);

            if (storageError) {
                console.error('Ошибка удаления файла из хранилища:', storageError);
                return res.status(500).json({ error: 'Ошибка удаления файла', details: storageError.message });
            }
        }

        // Удаление из таблицы videos
        const { error } = await supabase
            .from('videos')
            .delete()
            .eq('url', url);

        if (error) {
            console.error('Ошибка удаления видео:', error);
            return res.status(500).json({ error: 'Ошибка базы данных', details: error.message });
        }

        console.log(`Видео ${url} удалено`);
        res.status(200).json({ message: 'Видео успешно удалено' });
    } catch (error) {
        console.error('Критическая ошибка /api/delete-video:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера', details: error.message });
    }
});

// Обработка ошибок Multer
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        console.error('Ошибка Multer:', err);
        return res.status(400).json({ error: 'Ошибка загрузки файла', details: err.message });
    } else if (err) {
        console.error('Неизвестная ошибка:', err);
        return res.status(500).json({ error: 'Внутренняя ошибка сервера', details: err.message });
    }
    next();
});

// Обработка 404
app.use((req, res) => {
    console.warn(`404 - Запрос не найден: ${req.method} ${req.url}`);
    res.status(404).json({ error: 'Маршрут не найден' });
});

// Запуск сервера
app.listen(port, () => {
    console.log(`Сервер запущен на http://localhost:${port}`);
});

// Обработка непойманных ошибок
process.on('unhandledRejection', (reason, promise) => {
    console.error('Непойманная ошибка в промисе:', promise, 'причина:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Непойманная ошибка:', error);
});
