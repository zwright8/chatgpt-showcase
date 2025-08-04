// Serverless proxy function for Vercel.
// This endpoint fetches a given URL and returns its contents. It acts as a
// simple CORS proxy so that client‑side code can retrieve data from
// third‑party APIs without triggering cross‑origin restrictions. The handler
// expects a `url` query parameter containing the fully qualified URL to
// fetch. It uses the native fetch API available in Node 18+.

export default async function handler(req, res) {
  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }
  try {
    const response = await fetch(url);
    const contentType = response.headers.get('content-type') || '';
    const body = await response.text();
    // Set CORS headers to allow requests from any origin
    res.setHeader('Access-Control-Allow-Origin', '*');
    // Mirror the content type so the client can parse JSON when appropriate
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }
    res.status(200).send(body);
  } catch (err) {
    console.error('Proxy error:', err);
    res.status(500).json({ error: 'Unable to fetch url', details: err.message });
  }
}
