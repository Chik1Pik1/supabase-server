const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'https://tg-clips.netlify.app');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url, telegram_id } = req.body;

  if (!url || !telegram_id) {
    return res.status(400).json({ error: 'Missing url or telegram_id' });
  }

  try {
    // Проверка, что видео принадлежит пользователю
    const { data: video, error: fetchError } = await supabase
      .from('publicVideos')
      .select('*')
      .eq('url', url)
      .eq('author_id', telegram_id)
      .single();

    if (fetchError || !video) {
      return res.status(403).json({ error: 'Video not found or unauthorized' });
    }

    // Извлечение имени файла из URL
    const fileName = url.split('/').pop();
    const filePath = `videos/${fileName}`;

    // Удаление из Storage
    const { error: storageError } = await supabase.storage
      .from('videos')
      .remove([filePath]);

    if (storageError) {
      console.error('Storage error:', storageError);
      return res.status(500).json({ error: 'Failed to delete video from storage' });
    }

    // Удаление из publicVideos
    const { error: dbError } = await supabase
      .from('publicVideos')
      .delete()
      .eq('url', url);

    if (dbError) {
      console.error('Database error:', dbError);
      return res.status(500).json({ error: 'Failed to delete video metadata' });
    }

    return res.status(200).json({ message: 'Video deleted successfully' });
  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
