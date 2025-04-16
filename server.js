const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const multer = require('multer');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Настройка CORS для разрешения запросов с клиентского приложения
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
const supabase = createClient(supabaseUrl, supabaseKey);

// Настройка Multer для загрузки файлов
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Проверка работоспособности сервера
app.get('/', (req, res) => {
    res.send('Supabase сервер работает!');
});

// Получение всех публичных видео
app.get('/api/public-videos', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('videos')
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
        const { url, views, likes, dislikes, user_likes, user_dislikes, comments } = req.body;
        
        const { data, error } = await supabase
            .from('videos')
            .update({ views, likes, dislikes, user_likes, user_dislikes, comments })
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
            .from('videos')
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
            .from('videos')
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
app.post('/api/upload-video', upload.single('video'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Файл не загружен' });
        }
        
        const file = req.file;
        const fileName = `${Date.now()}-${file.originalname}`;
        
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('videos')
            .upload(fileName, file.buffer, {
                contentType: file.mimetype
            });
        
        if (uploadError) {
            console.error('Ошибка загрузки файла:', uploadError);
            return res.status(500).json({ error: uploadError.message });
        }
        
        const { data: publicUrlData } = supabase.storage
            .from('videos')
            .getPublicUrl(fileName);
        
        const videoData = {
            url: publicUrlData.publicUrl,
            file_name: fileName,
            is_public: true,
            views: [],
            likes: 0,
            dislikes: 0,
            user_likes: [],
            user_dislikes: [],
            comments: []
        };
        
        const { data: insertData, error: insertError } = await supabase
            .from('videos')
            .insert([videoData])
            .select();
        
        if (insertError) {
            console.error('Ошибка сохранения видео:', insertError);
            return res.status(500).json({ error: insertError.message });
        }
        
        res.json({ message: 'Видео успешно загружено', video: insertData[0] });
    } catch (err) {
        console.error('Серверная ошибка:', err);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// Регистрация канала
app.post('/api/register-channel', async (req, res) => {
    try {
        const { userId, channelName } = req.body;
        
        const { data, error } = await supabase
            .from('channels')
            .insert([{ user_id: userId, channel_name: channelName }])
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
