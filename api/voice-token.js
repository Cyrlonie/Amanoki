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

export default function handler(req, res) {
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

  const body = req.body || {};
  const roomName = String(body.roomName || '').trim();
  const userId = String(body.userId || '').trim();
  const username = String(body.username || '').trim();

  if (!roomName || !userId || !username) {
    return res.status(400).json({
      error: 'roomName, userId and username are required',
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
