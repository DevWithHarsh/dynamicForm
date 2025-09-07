export default function handler(req, res) {
  res.json({
    success: true,
    message: 'Server is running!',
    timestamp: new Date().toISOString(),
    environment: 'Vercel'
  });
}