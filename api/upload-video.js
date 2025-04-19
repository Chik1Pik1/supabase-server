const { createClient } = require('@supabase/supabase-js');
const formidable = require('formidable');
const fs = require('fs').promises;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = async (req, res) => {
  // Настройка CORS
  res.setHeader('Access-Control-Allow-Origin', 'https://tg-clips.netlify.app');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Обработка preflight запроса
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const form = formidable({ multiples: false });
  try {
    const { fields, files } = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        resolve({ fields, files });
      });
    });

    const telegram_id = fields.telegram_id?.[0];
    const description = fields.description?.[0] || '';
    const file = files.file?.[0];

    if (!telegram_id || !file) {
      return res.status(400).json({ error: 'Missing telegram_id or file' });
    }

    const fileData = await fs.readFile(file.filepath);
    const fileExt = file.originalFilename.split('.').pop();
    const fileName = `${telegram_id}_${Date.now()}.${fileExt}`;
    const filePath = `videos/${fileName}`;

    // Загрузка в Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('videos')
      .upload(filePath, fileData, {
        contentType: file.mimetype,
      });

    if (uploadError) {
      console.error('Storage error:', uploadError);
      return res.status(500).json({ error: 'Failed to upload video' });
    }

    const publicUrl = `${supabaseUrl}/storage/v1/object/public/videos/${fileName}`;

    // Сохранение метаданных в publicVideos
    const { error: dbError } = await supabase
      .from('publicVideos')
      .insert({
        url: publicUrl,
        author_id: telegram_id,
        description,
        views: [],
        likes: 0,
        dislikes: 0,
        user_likes: [],
        user_dislikes: [],
        comments: {},
        shares: 0,
        view_time: 0,
        replays: 0,
        duration: 0,
        last_position: 0,
        chat_messages: {},
        timestamp: new Date().toISOString(),
      });

    if (dbError) {
      console.error('Database error:', dbError);
      return res.status(500).json({ error: 'Failed to save video metadata' });
    }

    return res.status(200).json({ message: 'Video uploaded successfully', url: publicUrl });
  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
