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

  const { telegram_id, channel_link } = req.body;

  if (!telegram_id || !channel_link) {
    return res.status(400).json({ error: 'Missing telegram_id or channel_link' });
  }

  try {
    const { error } = await supabase
      .from('users')
      .upsert({ telegram_id, channel_link });

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ error: 'Failed to register channel' });
    }

    return res.status(200).json({ message: 'Channel registered successfully' });
  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
