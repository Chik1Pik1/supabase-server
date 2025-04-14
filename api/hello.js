const express = require('express');
const app = express();

app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'https://your-app.netlify.app'); // Замените на ваш Netlify-домен
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

app.get('/', (req, res) => {
  res.json({ message: 'Hello from Vercel!' });
});

app.post('/data', (req, res) => {
  const { input } = req.body;
  res.json({ received: input });
});

module.exports = app;