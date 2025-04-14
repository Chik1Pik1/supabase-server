const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();

// Настройка CORS для Netlify
app.use(cors({
  origin: 'https://your-app.netlify.app', // Замените на ваш Netlify-домен
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json());

// Подключение к Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// GET: Получить все клипы
app.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('clips')
    .select('*');
  if (error) {
    return res.status(500).json({ error: error.message });
  }
  res.json({ message: 'Clips fetched successfully', clips: data });
});

// POST: Добавить новый клип
app.post('/', async (req, res) => {
  const { title, url } = req.body;
  if (!title || !url) {
    return res.status(400).json({ error: 'Title and URL are required' });
  }
  const { data, error } = await supabase
    .from('clips')
    .insert([{ title, url }])
    .select();
  if (error) {
    return res.status(500).json({ error: error.message });
  }
  res.json({ message: 'Clip added successfully', clip: data[0] });
});

module.exports = app;