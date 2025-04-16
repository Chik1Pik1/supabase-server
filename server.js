const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

// Настройка CORS
const corsOptions = {
    origin: 'https://resonant-torte-bf7a96.netlify.app',
    methods: ['GET', 'POST', 'DELETE', 'PUT', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Парсинг JSON
app.use(express.json());

// Настройка Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Ошибка: SUPABASE_URL или SUPABASE_KEY не заданы');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Настройка Multer
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: 100 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const filetypes = /mp4|mov|webm/;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error('Неподдерживаемый формат файла! Используйте MP4, MOV или WebM.'));
    }
});

// Проверка работоспособности сервера
app.get('/', (req, res) => {
    res.send('Supabase сервер работает!');
});

// Получение всех публичных видео
app.get('/api/public-videos', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('publicVideos')
            .select('*')
            .eq('is_public', true);

        if (error) {
            console.error('Ошибка получения видео:', error);
            return res.status(500).json({ error: error.message });
        }

        res.json(data);
    } catch (err) {
        console.error('Серверная ошибка:', err);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// Обновление данных видео
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

        const updateData = {
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
        };

        const { data, error } = await supabase
            .from('publicVideos')
            .update(updateData)
            .eq('url', url)
            .select();

        if (error) {
            console.error('Ошибка обновления видео:', error);
            return res.status(500).json({ error: error.message });
        }

        res.json({ message: 'Video updated successfully', data });
    } catch (err) {
        console.error('Серверная ошибка:', err);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// Удаление видео
app.delete('/api/delete-video', async (req, res) => {
    try {
        const { url } = req.body;

        const { data: video, error: fetchError } = await supabase
            .from('publicVideos')
            .select('file_name')
            .eq('url', url)
            .single();

        if (fetchError) {
            console.error('Ошибка получения видео:', fetchError);
            return res.status(500).json({ error: fetchError.message });
        }

        if (!video) {
            return res.status(404).json({ error: 'Видео не найдено' });
        }

        const fileName = video.file_name;

        const { error: storageError } = await supabase.storage
            .from('videos')
            .remove([fileName]);

        if (storageError) {
            console.error('Ошибка удаления файла:', storageError);
            return res.status(500).json({ error: storageError.message });
        }

        const { error: deleteError } = await supabase
            .from('publicVideos')
            .delete()
            .eq('url', url);

        if (deleteError) {
            console.error('Ошибка удаления записи:', deleteError);
            return res.status(500).json({ error: deleteError.message });
        }

        res.json({ message: 'Видео успешно удалено' });
    } catch (err) {
        console.error('Серверная ошибка:', err);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// Загрузка видео
app.post('/api/upload-video', upload.fields([
    { name: 'video', maxCount: 1 },
    { name: 'userId', maxCount: 1 },
    { name: 'description', maxCount: 1 }
]), async (req, res) => {
    try {
        const file = req.files['video']?.[0];
        const userId = req.body.userId;
        const description = req.body.description || '';

        if (!file) {
            return res.status(400).json({ error: 'Файл не загружен' });
        }
        if (!userId) {
            return res.status(400).json({ error: 'userId обязателен' });
        }

        console.log('Полученные данные:', {
            file: file.originalname,
            userId,
            description
        });

        // Проверка пользователя в таблице users
        let { data: user, error: userError } = await supabase
            .from('users')
            .select('id')
            .eq('id', userId)
            .single();

        if (userError || !user) {
            console.log('Сохранение userId в users:', userId);
            const { error: insertError } = await supabase
                .from('users')
                .insert([{ id: userId, created_at: new Date().toISOString() }]);

            if (insertError) {
                console.error('Ошибка создания пользователя:', insertError);
                return res.status(500).json({ error: 'Ошибка создания пользователя' });
            }
        }

        // Загрузка файла в Supabase Storage
        const fileName = `${userId}/${Date.now()}-${file.originalname}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('videos')
            .upload(fileName, file.buffer, {
                contentType: file.mimetype
            });

        if (uploadError) {
            console.error('Ошибка загрузки файла:', uploadError);
            return res.status(500).json({ error: uploadError.message });
        }

        const { publicUrl } = supabase.storage
            .from('videos')
            .getPublicUrl(fileName).data;

        // Сохранение метаданных в таблицу publicVideos
        const videoData = {
            url: publicUrl,
            file_name: fileName,
            author_id: userId,
            description: description,
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
            created_at: new Date().toISOString()
        };

        console.log('Сохранение videoData:', videoData);
        const { data: insertData, error: insertError } = await supabase
            .from('publicVideos')
            .insert([videoData])
            .select();

        if (insertError) {
            console.error('Ошибка сохранения видео:', insertError);
            return res.status(500).json({ error: insertError.message });
        }

        res.json({ video: insertData[0] });
    } catch (err) {
        console.error('Серверная ошибка:', err);
        res.status(500).json({ error: `Внутренняя ошибка сервера: ${err.message}` });
    }
});

// Регистрация канала
app.post('/api/register-channel', async (req, res) => {
    try {
        const { userId, channelName } = req.body;

        if (!userId || !channelName) {
            return res.status(400).json({ error: 'userId и channelName обязательны' });
        }

        const { data, error } = await supabase
            .from('channels')
            .insert([{ user_id: userId, channel_name: channelName, created_at: new Date().toISOString() }])
            .select();

        if (error) {
            console.error('Ошибка регистрации канала:', error);
            return res.status(500).json({ error: error.message });
        }

        res.json({ message: 'Канал успешно зарегистрирован', channel: data[0] });
    } catch (err) {
        console.error('Серверная ошибка:', err);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// Получение зарегистрированных каналов
app.get('/api/channels/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        console.log('Обработка маршрута /api/channels/:userId с userId:', userId);

        const { data, error } = await supabase
            .from('channels')
            .select('*')
            .eq('user_id', userId);

        if (error) {
            console.error('Ошибка получения каналов:', error);
            return res.status(500).json({ error: error.message });
        }

        res.json(data);
    } catch (err) {
        console.error('Серверная ошибка:', err);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
    console.log(`Supabase URL: ${supabaseUrl}`);
});
