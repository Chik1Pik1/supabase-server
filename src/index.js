import { createClient } from '@supabase/supabase-js';

// Заголовки CORS для всех ответов
const corsHeaders = {
    'Access-Control-Allow-Origin': '*', // Или конкретный origin: 'https://tg-clips.netlify.app'
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
};

// Инициализация Supabase клиента
const supabase = createClient(
    'https://seckthcbnslsropswpik.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNlY2t0aGNibnNsc3JvcHN3cGlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDMxNzU3ODMsImV4cCI6MjA1ODc1MTc4M30.JoI03vFuRd-7sApD4dZ-zeBfUQlZrzRg7jtz0HgnJyI' // Замените на ваш анонимный ключ Supabase
);

addEventListener('fetch', event => {
    event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
    // Обработка предварительных запросов OPTIONS
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            headers: corsHeaders
        });
    }

    const { pathname, searchParams } = new URL(request.url);

    try {
        // Маршрут для получения списка каналов
        if (pathname === '/api/channels' && request.method === 'GET') {
            const { data, error } = await supabase
                .from('channels')
                .select('user_id, channel_name');

            if (error) {
                console.error('Supabase error in /api/channels:', error);
                return new Response(JSON.stringify({ error: error.message }), {
                    status: 500,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            return new Response(JSON.stringify(data), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Маршрут для получения публичных видео
        if (pathname === '/api/public-videos' && request.method === 'GET') {
            const { data, error } = await supabase
                .from('videos')
                .select('*')
                .eq('is_public', true);

            if (error) {
                console.error('Supabase error in /api/public-videos:', error);
                return new Response(JSON.stringify({ error: error.message }), {
                    status: 500,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            return new Response(JSON.stringify(data), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Маршрут для регистрации канала
        if (pathname === '/api/register-channel' && request.method === 'POST') {
            const body = await request.json();
            const { userId, channelName } = body;

            if (!userId || !channelName) {
                return new Response(JSON.stringify({ error: 'userId and channelName are required' }), {
                    status: 400,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            const { data, error } = await supabase
                .from('channels')
                .upsert([{ user_id: userId, channel_name: channelName }], { onConflict: 'user_id' });

            if (error) {
                console.error('Supabase error in /api/register-channel:', error);
                return new Response(JSON.stringify({ error: error.message }), {
                    status: 500,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            return new Response(JSON.stringify({ message: 'Channel registered', data }), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Маршрут для загрузки видео
        if (pathname === '/api/upload-video' && request.method === 'POST') {
            const formData = await request.formData();
            const videoFile = formData.get('video');
            const userId = formData.get('userId');
            const description = formData.get('description') || '';

            if (!videoFile || !userId) {
                return new Response(JSON.stringify({ error: 'video and userId are required' }), {
                    status: 400,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            // Загрузка видео в Supabase Storage
            const fileName = `${userId}/${Date.now()}_${videoFile.name}`;
            const { error: uploadError } = await supabase.storage
                .from('videos')
                .upload(fileName, videoFile);

            if (uploadError) {
                console.error('Supabase storage error in /api/upload-video:', uploadError);
                return new Response(JSON.stringify({ error: uploadError.message }), {
                    status: 500,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            // Получение публичного URL видео
            const { publicURL, error: urlError } = supabase.storage
                .from('videos')
                .getPublicUrl(fileName);

            if (urlError || !publicURL) {
                console.error('Supabase URL error in /api/upload-video:', urlError);
                return new Response(JSON.stringify({ error: 'Failed to get video URL' }), {
                    status: 500,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            // Сохранение метаданных видео в таблице videos
            const videoData = {
                url: publicURL,
                author_id: userId,
                description,
                is_public: true,
                views: [],
                likes: 0,
                dislikes: 0,
                comments: [],
                shares: 0,
                view_time: 0,
                replays: 0,
                last_position: 0,
                chat_messages: []
            };

            const { error: insertError } = await supabase
                .from('videos')
                .insert([videoData]);

            if (insertError) {
                console.error('Supabase insert error in /api/upload-video:', insertError);
                return new Response(JSON.stringify({ error: insertError.message }), {
                    status: 500,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            return new Response(JSON.stringify({ video: videoData }), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Маршрут для обновления данных видео
        if (pathname === '/api/update-video' && request.method === 'POST') {
            const body = await request.json();
            const { url, views, likes, dislikes, comments, shares, view_time, replays, last_position, chat_messages } = body;

            if (!url) {
                return new Response(JSON.stringify({ error: 'url is required' }), {
                    status: 400,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            const { error } = await supabase
                .from('videos')
                .update({
                    views: views || [],
                    likes: likes || 0,
                    dislikes: dislikes || 0,
                    comments: comments || [],
                    shares: shares || 0,
                    view_time: view_time || 0,
                    replays: replays || 0,
                    last_position: last_position || 0,
                    chat_messages: chat_messages || []
                })
                .eq('url', url);

            if (error) {
                console.error('Supabase error in /api/update-video:', error);
                return new Response(JSON.stringify({ error: error.message }), {
                    status: 500,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            return new Response(JSON.stringify({ message: 'Video data updated' }), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Маршрут для удаления видео
        if (pathname === '/api/delete-video' && request.method === 'DELETE') {
            const body = await request.json();
            const { url } = body;

            if (!url) {
                return new Response(JSON.stringify({ error: 'url is required' }), {
                    status: 400,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            // Извлечение имени файла из URL
            const fileName = url.split('/').slice(-2).join('/'); // Например, userId/filename.mp4

            // Удаление файла из Supabase Storage
            const { error: storageError } = await supabase.storage
                .from('videos')
                .remove([fileName]);

            if (storageError) {
                console.error('Supabase storage error in /api/delete-video:', storageError);
                return new Response(JSON.stringify({ error: storageError.message }), {
                    status: 500,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            // Удаление записи из таблицы videos
            const { error: deleteError } = await supabase
                .from('videos')
                .delete()
                .eq('url', url);

            if (deleteError) {
                console.error('Supabase delete error in /api/delete-video:', deleteError);
                return new Response(JSON.stringify({ error: deleteError.message }), {
                    status: 500,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            return new Response(JSON.stringify({ message: 'Video deleted' }), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Маршрут для скачивания видео
        if (pathname === '/api/download-video' && request.method === 'GET') {
            const videoUrl = searchParams.get('url');

            if (!videoUrl) {
                return new Response(JSON.stringify({ error: 'url is required' }), {
                    status: 400,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            // Получение файла из Supabase Storage
            const fileName = videoUrl.split('/').slice(-2).join('/');
            const { data, error } = await supabase.storage
                .from('videos')
                .download(fileName);

            if (error) {
                console.error('Supabase storage error in /api/download-video:', error);
                return new Response(JSON.stringify({ error: error.message }), {
                    status: 500,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            // Чтение содержимого файла
            const arrayBuffer = await data.arrayBuffer();

            return new Response(arrayBuffer, {
                status: 200,
                headers: {
                    ...corsHeaders,
                    'Content-Type': data.type || 'video/mp4',
                    'Content-Length': arrayBuffer.byteLength.toString()
                }
            });
        }

        // Если маршрут не найден
        return new Response(JSON.stringify({ error: 'Route not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Worker error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
}
