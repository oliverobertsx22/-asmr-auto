const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config();

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

function makeKlingJWT() {
  return jwt.sign(
    { iss: process.env.KLING_ACCESS_KEY, exp: Math.floor(Date.now() / 1000) + 1800, nbf: Math.floor(Date.now() / 1000) - 5 },
    process.env.KLING_SECRET_KEY,
    { algorithm: 'HS256', header: { alg: 'HS256', typ: 'JWT' } }
  );
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/generate-video', async (req, res) => {
  try {
    const { prompt, type } = req.body;
    const token = makeKlingJWT();
    const response = await fetch('https://api.klingai.com/v1/videos/text2video', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model_name: 'kling-v1', prompt, negative_prompt: 'people, text, watermark, logo', mode: 'std', aspect_ratio: '9:16', duration: '5', cfg_scale: 0.5 }),
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data?.message || 'Kling error' });
    res.json({ taskId: data?.data?.task_id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/video-status/:taskId', async (req, res) => {
  try {
    const token = makeKlingJWT();
    const response = await fetch(`https://api.klingai.com/v1/videos/text2video/${req.params.taskId}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const data = await response.json();
    const status = data?.data?.task_status;
    const videoUrl = data?.data?.task_result?.videos?.[0]?.url;
    res.json({ status, videoUrl: videoUrl || null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/videos', async (req, res) => {
  try {
    const { data, error } = await supabase.from('videos').insert(req.body).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/videos', async (req, res) => {
  try {
    const { data, error } = await supabase.from('videos').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/videos/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('videos').update(req.body).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/upload-audio', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    co
