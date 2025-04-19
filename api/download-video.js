const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'https://tg-clips.netlify.app');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  try {
    // Проверка существования видео
    const { data: video, error: fetchError } = await supabase
      .from('publicVideos')
      .select('url')
      .eq('url', url)
      .single();

    if (fetchError || !video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    // Перенаправление на публичный URL видео
    res.redirect(url);
  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
