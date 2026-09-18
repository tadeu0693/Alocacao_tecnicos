import { getJSON } from './_lib/db.js';
import { sendDbError } from './_lib/auth.js';

export default async function handler(req, res) {
  try {
    const users = await getJSON('usuarios', []);
    res.status(200).json({ hasUsers: users.length > 0 });
  } catch (e) {
    if (sendDbError(res, e)) return;
    res.status(500).json({ error: 'Erro interno.' });
  }
}
