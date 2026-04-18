// Supabase config bootstrap (classic script, no bundler).

let SUPABASE_URL = '';
let SUPABASE_ANON_KEY = '';

async function loadSupabaseConfig() {
  if (!window.location.protocol.startsWith('http')) {
    throw new Error(
      'Конфиг Supabase недоступен при открытии файла напрямую. Запусти проект через Vercel или локальный сервер.'
    );
  }

  const configUrl = new URL('./api/config', window.location.href);
  let response;

  try {
    response = await fetch(configUrl, { cache: 'no-store' });
  } catch (_) {
    throw new Error(
      'Не удалось обратиться к /api/config. Если ты запускаешь проект локально, используй сервер с поддержкой API routes.'
    );
  }

  if (!response.ok) {
    let errorMessage = 'Не удалось загрузить конфиг Supabase';
    try {
      const errorData = await response.json();
      if (errorData?.error) errorMessage = errorData.error;
    } catch (_) {}
    throw new Error(errorMessage);
  }

  const config = await response.json();
  if (!config?.supabaseUrl || !config?.supabaseAnonKey) {
    throw new Error('Переменные Supabase не настроены на сервере');
  }

  SUPABASE_URL = config.supabaseUrl;
  SUPABASE_ANON_KEY = config.supabaseAnonKey;
}

async function initializeSupabaseClient() {
  if (supabase) return supabase;
  if (supabaseInitPromise) return supabaseInitPromise;

  supabaseInitPromise = (async () => {
    await loadSupabaseConfig();
    const module = await import(
      'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.43.1/+esm'
    );
    supabase = module.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return supabase;
  })();

  try {
    return await supabaseInitPromise;
  } finally {
    supabaseInitPromise = null;
  }
}

