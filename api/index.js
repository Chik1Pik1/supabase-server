const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = async (req, res) => {
  // Настройка CORS
  res.setHeader('Access-Control-Allow-Origin', 'https://tg-clips.netlify.app');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Обработка preflight-запроса OPTIONS
  if (req.method === 'OPTIONS') {
    return res.status(200).json({});
  }

  const { path } = req; // Например, /api/public-videos
  const route = path.replace('/api/', ''); // Извлекаем часть после /api/

  try {
    if (route === 'public-videos' && req.method === 'GET') {
      // Запрос к таблице publicVideos
      const { data, error } = await supabase
        .from('publicVideos')
        .select('url, author_id, description, views, likes, dislikes, user_likes, user_dislikes, comments, shares, view_time, replays, duration, last_position, chat_messages');

      if (error) throw new Error(`Supabase error: ${error.message}`);
      return res.status(200).json(data || []);
    }

    if (route === 'register-channel' && req.method === 'POST') {
      const { telegram_id, channel_link } = req.body;
      if (!telegram_id || !channel_link) {
        return res.status(400).json({ error: 'Missing telegram_id or channel_link' });
      }
      const { error } = await supabase
        .from('users')
        .insert([{ telegram_id, channel_link }]);
      if (error) throw new Error(`Supabase error: ${error.message}`);
      return res.status(200).json({ message: 'Channel registered successfully' });
    }

    if (route === 'update-video' && req.method === 'POST') {
      const { url, views, likes, dislikes, user_likes, user_dislikes, comments, shares, view_time, replays, duration, last_position, chat_messages } = req.body;
      const { error } = await supabase
        .from('publicVideos')
        .update({ views, likes, dislikes, user_likes, user_dislikes, comments, shares, view_time, replays, duration, last_position, chat_messages })
        .eq('url', url);
      if (error) throw new Error(`Supabase error: ${error.message}`);
      return res.status(200).json({ message: 'Video updated successfully' });
    }

    // Другие маршруты (upload-video, delete-video, download-video) можно добавить сюда

    // Если маршрут не найден
    return res.status(404).json({ error: 'Route not found' });
  } catch (error) {
    console.error(`Error in ${route}:`, error);
    res.status(500).json({ error: error.message });
  }
};
