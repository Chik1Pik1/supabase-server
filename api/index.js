const { createClient } = require('@supabase/supabase-js');

// Инициализация Supabase клиента
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Основной обработчик запросов
module.exports = async (req, res) => {
  // Настройка CORS
  res.setHeader('Access-Control-Allow-Origin', 'https://tg-clips.netlify.app');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Обработка preflight-запроса OPTIONS
  if (req.method === 'OPTIONS') {
    return res.status(200).json({});
  }

  const { path, method, body } = req;
  const route = path.replace('/api/', ''); // Извлекаем часть после /api/

  try {
    // GET /api/public-videos: Получение списка публичных видео
    if (route === 'public-videos' && method === 'GET') {
      const { data, error } = await supabase
        .from('publicVideos')
        .select('url, author_id, description, views, likes, dislikes, user_likes, user_dislikes, comments, shares, view_time, replays, duration, last_position, chat_messages');

      if (error) throw new Error(`Supabase error: ${error.message}`);
      return res.status(200).json(data || []);
    }

    // POST /api/register-channel: Регистрация Telegram-канала
    if (route === 'register-channel' && method === 'POST') {
      const { telegram_id, channel_link } = body;
      if (!telegram_id || !channel_link) {
        return res.status(400).json({ error: 'Missing telegram_id or channel_link' });
      }
      const { error } = await supabase
        .from('users')
        .insert([{ telegram_id, channel_link }]);
      if (error) throw new Error(`Supabase error: ${error.message}`);
      return res.status(200).json({ message: 'Channel registered successfully' });
    }

    // POST /api/upload-video: Загрузка видео в Supabase Storage
    if (route === 'upload-video' && method === 'POST') {
      const { telegram_id, file, description } = body;
      if (!telegram_id || !file) {
        return res.status(400).json({ error: 'Missing telegram_id or file' });
      }

      // Загрузка файла в Supabase Storage
      const fileName = `${telegram_id}_${Date.now()}.mp4`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('videos')
        .upload(fileName, file, { contentType: 'video/mp4' });

      if (uploadError) throw new Error(`Storage error: ${uploadError.message}`);

      const { publicUrl } = supabase.storage.from('videos').getPublicUrl(fileName).data;

      // Сохранение метаданных видео в таблице publicVideos
      const { error: insertError } = await supabase
        .from('publicVideos')
        .insert([
          {
            url: publicUrl,
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
            chat_messages: []
          }
        ]);

      if (insertError) throw new Error(`Supabase error: ${insertError.message}`);
      return res.status(200).json({ message: 'Video uploaded successfully', url: publicUrl });
    }

    // POST /api/update-video: Обновление метаданных видео
    if (route === 'update-video' && method === 'POST') {
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
        chat_messages
      } = body;

      if (!url) {
        return res.status(400).json({ error: 'Missing video URL' });
      }

      const { error } = await supabase
        .from('publicVideos')
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
          chat_messages: chat_messages || []
        })
        .eq('url', url);

      if (error) throw new Error(`Supabase error: ${error.message}`);
      return res.status(200).json({ message: 'Video updated successfully' });
    }

    // POST /api/delete-video: Удаление видео
    if (route === 'delete-video' && method === 'POST') {
      const { url, telegram_id } = body;
      if (!url || !telegram_id) {
        return res.status(400).json({ error: 'Missing url or telegram_id' });
      }

      // Проверка, что видео принадлежит пользователю
      const { data: video, error: fetchError } = await supabase
        .from('publicVideos')
        .select('author_id')
        .eq('url', url)
        .single();

      if (fetchError) throw new Error(`Supabase error: ${fetchError.message}`);
      if (!video || video.author_id !== telegram_id) {
        return res.status(403).json({ error: 'Unauthorized: You do not own this video' });
      }

      // Удаление из таблицы publicVideos
      const { error: deleteDbError } = await supabase
        .from('publicVideos')
        .delete()
        .eq('url', url);

      if (deleteDbError) throw new Error(`Supabase error: ${deleteDbError.message}`);

      // Удаление файла из Storage
      const fileName = url.split('/').pop();
      const { error: deleteStorageError } = await supabase.storage
        .from('videos')
        .remove([fileName]);

      if (deleteStorageError) throw new Error(`Storage error: ${deleteStorageError.message}`);
      return res.status(200).json({ message: 'Video deleted successfully' });
    }

    // GET /api/download-video: Получение ссылки на скачивание
    if (route.startsWith('download-video') && method === 'GET') {
      const url = new URL(req.url, `https://${req.headers.host}`).searchParams.get('url');
      if (!url) {
        return res.status(400).json({ error: 'Missing video URL' });
      }

      const fileName = url.split('/').pop();
      const { data: signedUrl, error } = await supabase.storage
        .from(' کارهای')
        .createSignedUrl(fileName, 60); // Ссылка действительна 60 секунд

      if (error) throw new Error(`Storage error: ${error.message}`);
      return res.status(200).json({ signedUrl });
    }

    // Если маршрут не найден
    return res.status(404).json({ error: 'Route not found' });
  } catch (error) {
    console.error(`Error in ${route}:`, error);
    res.status(500).json({ error: error.message });
  }
};
