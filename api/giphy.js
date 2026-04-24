
export default async function handler(req, res) {
  const { q, type, offset } = req.query;
  const apiKey = process.env.GIPHY_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'Giphy API key not configured' });
  }

  const limit = 20;
  const endpoint = q ? 'search' : 'trending';
  const giphyType = type === 'sticker' ? 'stickers' : 'gifs';
  
  const url = `https://api.giphy.com/v1/${giphyType}/${endpoint}?api_key=${apiKey}&limit=${limit}&offset=${offset || 0}${q ? `&q=${encodeURIComponent(q)}` : ''}&rating=g`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    
    // Simplify the response for the frontend
    const results = data.data.map(item => ({
      id: item.id,
      url: item.images.fixed_height.url,
      preview: item.images.fixed_height_small.url,
      title: item.title
    }));

    res.status(200).json({ results });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch from Giphy' });
  }
}
