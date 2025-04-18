import { createClient } from '@supabase/supabase-js';

export default {
  async fetch(request, env, ctx) {
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
    const url = new URL(request.url);
    const corsHeaders = {
      'Access-Control-Allow-Origin': url.origin === 'http://localhost:3000' ? 'http://localhost:3000' : 'https://tg-clips.netlify.app',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // OPTIONS for CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 200, headers: corsHeaders });
    }

    // GET / - Корневой путь
    if (request.method === 'GET' && url.pathname === '/') {
      return new Response('Welcome to TG Clips API!', {
        status: 200,
        headers: { 'Content-Type': 'text/plain', ...corsHeaders },
      });
    }

    // GET /api/public-videos - Получить публичные видео
    if (request.method === 'GET' && url.pathname === '/api/public-videos') {
      try {
        const { data, error } = await supabase
          .from('publicVideos')
          .select('*')
          .eq('is_public', true);
        if (error) {
          console.error('Supabase error:', error);
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          });
        }
        return new Response(JSON.stringify(data), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      } catch (err) {
        console.error('Server error:', err);
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
    }

    // POST /api/update-video - Обновить данные видео
    if (request.method === 'POST' && url.pathname === '/api/update-video') {
      try {
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
          chat_messages,
          description,
          author_id,
        } = await request.json();
        const { data, error } = await supabase
          .from('publicVideos')
          .update({
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
            chat_messages,
            description,
            author_id,
            updated_at: new Date().toISOString(),
          })
          .eq('url', url)
          .select();
        if (error) {
          console.error('Supabase error:', error);
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          });
        }
        return new Response(JSON.stringify({ message: 'Video updated successfully', data }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      } catch (err) {
        console.error('Server error:', err);
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
    }

    // DELETE /api/delete-video - Удалить видео
    if (request.method === 'DELETE' && url.pathname === '/api/delete-video') {
      try {
        const { url } = await request.json();
        const { data: video, error: fetchError } = await supabase
          .from('publicVideos')
          .select('file_name')
          .eq('url', url)
          .single();
        if (fetchError) {
          console.error('Supabase error:', fetchError);
          return new Response(JSON.stringify({ error: fetchError.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          });
        }
        if (!video) {
          return new Response(JSON.stringify({ error: 'Video not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          });
        }
        const fileName = video.file_name;
        const { error: storageError } = await supabase.storage
          .from('videos')
          .remove([fileName]);
        if (storageError) {
          console.error('Storage error:', storageError);
          return new Response(JSON.stringify({ error: storageError.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          });
        }
        const { error: deleteError } = await supabase
          .from('publicVideos')
          .delete()
          .eq('url', url);
        if (deleteError) {
          console.error('Supabase error:', deleteError);
          return new Response(JSON.stringify({ error: deleteError.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          });
        }
        return new Response(JSON.stringify({ message: 'Video deleted successfully' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      } catch (err) {
        console.error('Server error:', err);
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
    }

    // POST /api/upload-video - Загрузка видео
    if (request.method === 'POST' && url.pathname === '/api/upload-video') {
      try {
        const formData = await request.formData();
        const file = formData.get('video');
        const author_id = formData.get('userId') || 'unknown';
        const description = formData.get('description') || '';
        if (!file) {
          return new Response(JSON.stringify({ error: 'No file uploaded' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          });
        }
        const fileName = `${Date.now()}-${file.name}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('videos')
          .upload(fileName, file, {
            contentType: file.type,
          });
        if (uploadError) {
          console.error('Storage error:', uploadError);
          return new Response(JSON.stringify({ error: uploadError.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          });
        }
        const { data: publicUrlData } = supabase.storage
          .from('videos')
          .getPublicUrl(fileName);
        const videoData = {
          url: publicUrlData.publicUrl,
          file_name: fileName,
          is_public: true,
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
          chat_messages: [],
          description,
          author_id,
          timestamp: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        const { data: insertData, error: insertError } = await supabase
          .from('publicVideos')
          .insert([videoData])
          .select();
        if (insertError) {
          console.error('Supabase error:', insertError);
          return new Response(JSON.stringify({ error: insertError.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          });
        }
        return new Response(JSON.stringify({ message: 'Video uploaded successfully', video: insertData[0] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      } catch (err) {
        console.error('Server error:', err);
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
    }

    // POST /api/register-channel - Регистрация канала
    if (request.method === 'POST' && url.pathname === '/api/register-channel') {
      try {
        const { userId, channelName } = await request.json();
        if (!userId || !channelName) {
          return new Response(JSON.stringify({ error: 'userId and channelName are required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          });
        }
        if (!channelName.match(/^https:\/\/t\.me\/[a-zA-Z0-9_]+$/)) {
          return new Response(JSON.stringify({ error: 'Invalid channelName format' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          });
        }
        const { data, error } = await supabase
          .from('channels')
          .upsert({ user_id: userId, channel_name: channelName }, { onConflict: 'user_id' })
          .select();
        if (error) {
          console.error('Supabase error:', error);
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          });
        }
        return new Response(JSON.stringify({ message: 'Channel registered successfully', channel: data[0] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      } catch (err) {
        console.error('Server error:', err);
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
    }

    // 404 для остальных маршрутов
    return new Response('Not Found', {
      status: 404,
      headers: { 'Content-Type': 'text/plain', ...corsHeaders },
    });
  },
};
