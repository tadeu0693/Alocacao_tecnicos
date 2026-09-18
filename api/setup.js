import crypto from 'crypto';
import { setJSON } from './_lib/db.js';
import { getUsers, saveUsers, hashPassword, createSession, publicUser, sendDbError } from './_lib/auth.js';
import { TECNICOS_SEED, PROJETOS_SEED, ALLOC_SEED } from './_lib/seed.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });
  try {
    const users = await getUsers();
    if (users.length > 0) return res.status(400).json({ error: 'Já existe um administrador cadastrado.' });
    const { email, senha } = req.body || {};
    if (!email || !senha) return res.status(400).json({ error: 'Preencha e-mail e senha.' });
    const hash = await hashPassword(senha);
    const user = { id: crypto.randomUUID(), email: String(email).trim().toLowerCase(), senhaHash: hash, papel: 'admin', tecnicoId: null };
    await saveUsers([user]);
    await setJSON('tecnicos', TECNICOS_SEED);
    await setJSON('projetos', PROJETOS_SEED);
    await setJSON('allocations', ALLOC_SEED.map(a => ({ id: crypto.randomUUID(), ...a })));
    const token = await createSession(user.id);
    res.status(200).json({ token, user: publicUser(user) });
  } catch (e) {
    if (sendDbError(res, e)) return;
    console.error(e);
    res.status(500).json({ error: 'Erro interno.' });
  }
}
