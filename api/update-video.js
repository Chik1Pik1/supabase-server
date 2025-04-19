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

  const { url, description, telegram_id } = req.body;

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

    // Обновление метаданных
    const updates = { description: description || video.description };
    const { error: updateError } = await supabase
      .from('publicVideos')
      .update(updates)
      .eq('url', url);

    if (updateError) {
      console.error('Supabase error:', updateError);
      return res.status(500).json({ error: 'Failed to update video' });
    }

    return res.status(200).json({ message: 'Video updated successfully' });
  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
