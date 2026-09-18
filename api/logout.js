import { destroySession, sendDbError } from './_lib/auth.js';

export default async function handler(req, res) {
  try {
    const auth = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    await destroySession(token);
    res.status(200).json({ ok: true });
  } catch (e) {
    if (sendDbError(res, e)) return;
    res.status(500).json({ error: 'Erro interno.' });
  }
}
