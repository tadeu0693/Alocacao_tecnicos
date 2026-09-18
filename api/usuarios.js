import crypto from 'crypto';
import { getUserFromReq, getUsers, saveUsers, hashPassword, sendDbError } from './_lib/auth.js';

export default async function handler(req, res) {
  try {
    const user = await getUserFromReq(req);
    if (!user) return res.status(401).json({ error: 'Não autenticado.' });

    if (req.method === 'POST') {
      if (user.papel !== 'admin') return res.status(403).json({ error: 'Só administradores podem gerenciar usuários.' });
      const { email, senha, papel, tecnicoId } = req.body || {};
      const emailNorm = String(email || '').trim().toLowerCase();
      if (!emailNorm || !senha) return res.status(400).json({ error: 'Preencha e-mail e senha.' });
      if (!['admin', 'editor', 'planejador', 'supervisor', 'tecnico'].includes(papel)) return res.status(400).json({ error: 'Papel inválido.' });
      if (papel === 'tecnico' && !tecnicoId) return res.status(400).json({ error: 'Selecione o técnico vinculado.' });
      const users = await getUsers();
      if (users.some(u => u.email === emailNorm)) return res.status(400).json({ error: 'Já existe um usuário com esse e-mail.' });
      const hash = await hashPassword(senha);
      const novo = { id: crypto.randomUUID(), email: emailNorm, senhaHash: hash, papel, tecnicoId: papel === 'tecnico' ? tecnicoId : null };
      users.push(novo);
      await saveUsers(users);
      return res.status(200).json({ usuario: { id: novo.id, email: novo.email, papel: novo.papel, tecnicoId: novo.tecnicoId } });
    }

    const id = req.query.id;

    if (req.method === 'PATCH') {
      if (!id) return res.status(400).json({ error: 'ID é obrigatório.' });
      if (user.papel !== 'admin' && user.id !== id) return res.status(403).json({ error: 'Sem permissão.' });
      const { senha } = req.body || {};
      if (!senha || senha.length < 6) return res.status(400).json({ error: 'Use uma senha com pelo menos 6 caracteres.' });
      const users = await getUsers();
      const idx = users.findIndex(u => u.id === id);
      if (idx === -1) return res.status(404).json({ error: 'Usuário não encontrado.' });
      users[idx].senhaHash = await hashPassword(senha);
      await saveUsers(users);
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'DELETE') {
      if (user.papel !== 'admin') return res.status(403).json({ error: 'Só administradores podem gerenciar usuários.' });
      if (!id) return res.status(400).json({ error: 'ID é obrigatório.' });
      let users = await getUsers();
      users = users.filter(u => u.id !== id);
      await saveUsers(users);
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'Método não permitido.' });
  } catch (e) {
    if (sendDbError(res, e)) return;
    res.status(500).json({ error: 'Erro interno.' });
  }
}
