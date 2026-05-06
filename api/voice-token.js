import crypto from 'crypto';

function base64UrlEncode(value) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function signJwtHS256(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto.createHmac('sha256', secret).update(signingInput).digest();
  return `${signingInput}.${base64UrlEncode(signature)}`;
}

async function fetchSupabaseUser(accessToken, supabaseUrl, supabaseAnonKey) {
  const url = new URL('/auth/v1/user', supabaseUrl);
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    return null;
  }

  try {
    return await response.json();
  } catch (_) {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const livekitUrl = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;

  if (!livekitUrl || !apiKey || !apiSecret) {
    return res.status(500).json({
      error: 'Missing LiveKit env vars',
      required: ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET'],
    });
  }

  const authHeader = req.headers.authorization || '';
  const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  const accessToken = tokenMatch ? tokenMatch[1] : '';
  if (!accessToken) {
    return res.status(401).json({ error: 'Missing Authorization bearer token' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(500).json({
      error: 'Missing Supabase env vars',
      required: ['SUPABASE_URL', 'SUPABASE_ANON_KEY'],
    });
  }

  const supabaseUser = await fetchSupabaseUser(accessToken, supabaseUrl, supabaseAnonKey);
  if (!supabaseUser?.id) {
    return res.status(401).json({ error: 'Invalid or expired Supabase session' });
  }

  const body = req.body || {};
  const roomName = String(body.roomName || '').trim();
  const userId = String(supabaseUser.id || '').trim();
  const username =
    String((supabaseUser.user_metadata && supabaseUser.user_metadata.username) || '').trim() ||
    String((supabaseUser.user_metadata && supabaseUser.user_metadata.full_name) || '').trim() ||
    String(supabaseUser.email || '').trim() ||
    `user-${userId.slice(0, 8)}`;

  if (!roomName || !userId) {
    return res.status(400).json({
      error: 'roomName is required',
    });
  }

  const now = Math.floor(Date.now() / 1000);
  const expiresInSec = 60 * 60; // 1h
  const payload = {
    iss: apiKey,
    sub: userId,
    name: username,
    nbf: now - 10,
    iat: now,
    exp: now + expiresInSec,
    video: {
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
    },
  };

  try {
    const token = signJwtHS256(payload, apiSecret);
    return res.status(200).json({
      token,
      url: livekitUrl,
      expiresInSec,
    });
  } catch (error) {
    return res.status(500).json({ error: `Failed to sign token: ${error.message}` });
  }
}
