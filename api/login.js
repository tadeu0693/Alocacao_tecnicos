import { getUsers, checkPassword, createSession, publicUser, sendDbError } from './_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });
  try {
    const { email, senha } = req.body || {};
    const users = await getUsers();
    const user = users.find(u => u.email === String(email || '').trim().toLowerCase());
    if (!user || !(await checkPassword(senha || '', user.senhaHash))) {
      return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
    }
    const token = await createSession(user.id);
    res.status(200).json({ token, user: publicUser(user) });
  } catch (e) {
    if (sendDbError(res, e)) return;
    res.status(500).json({ error: 'Erro interno.' });
  }
}
