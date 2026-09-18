import { getUserFromReq, publicUser, sendDbError } from './_lib/auth.js';

export default async function handler(req, res) {
  try {
    const user = await getUserFromReq(req);
    if (!user) return res.status(401).json({ error: 'Não autenticado.' });
    res.status(200).json({ user: publicUser(user) });
  } catch (e) {
    if (sendDbError(res, e)) return;
    res.status(500).json({ error: 'Erro interno.' });
  }
}
