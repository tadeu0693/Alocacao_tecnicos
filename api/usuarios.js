import crypto from 'crypto';
import { getJSON } from './_lib/db.js';
import { getUserFromReq, getUsers, saveUsers, hashPassword, sendDbError } from './_lib/auth.js';

const PAPEIS = ['admin', 'editor', 'planejador', 'supervisor', 'visualizador', 'tecnico'];

export default async function handler(req, res) {
  try {
    const user = await getUserFromReq(req);
    if (!user) return res.status(401).json({ error: 'Não autenticado.' });

    if (req.method === 'POST') {
      if (user.papel !== 'admin') return res.status(403).json({ error: 'Só administradores podem gerenciar usuários.' });
      const { email, senha, papel, tecnicoId } = req.body || {};
      const emailNorm = String(email || '').trim().toLowerCase();
      if (!emailNorm || !senha) return res.status(400).json({ error: 'Preencha e-mail e senha.' });
      if (!PAPEIS.includes(papel)) return res.status(400).json({ error: 'Papel inválido.' });
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
      const { senha, papel, tecnicoId } = req.body || {};
      const users = await getUsers();
      const idx = users.findIndex(u => u.id === id);
      if (idx === -1) return res.status(404).json({ error: 'Usuário não encontrado.' });

      // Troca de papel (só admin)
      if (papel !== undefined) {
        if (user.papel !== 'admin') return res.status(403).json({ error: 'Só administradores podem alterar permissões.' });
        if (!PAPEIS.includes(papel)) return res.status(400).json({ error: 'Papel inválido.' });
        if (papel === 'tecnico') {
          if (!tecnicoId) return res.status(400).json({ error: 'Selecione o técnico vinculado.' });
          const tecnicos = await getJSON('tecnicos', []);
          if (!tecnicos.some(t => t.id === tecnicoId)) return res.status(400).json({ error: 'Técnico não encontrado.' });
        }
        const eraAdmin = users[idx].papel === 'admin';
        if (eraAdmin && papel !== 'admin') {
          const admins = users.filter(u => u.papel === 'admin').length;
          if (admins <= 1) return res.status(400).json({ error: 'É preciso manter pelo menos um administrador.' });
        }
        users[idx].papel = papel;
        users[idx].tecnicoId = papel === 'tecnico' ? tecnicoId : null;
      }

      // Troca de senha (admin ou o próprio usuário)
      if (senha !== undefined) {
        if (user.papel !== 'admin' && user.id !== id) return res.status(403).json({ error: 'Sem permissão.' });
        if (!senha || senha.length < 6) return res.status(400).json({ error: 'Use uma senha com pelo menos 6 caracteres.' });
        users[idx].senhaHash = await hashPassword(senha);
      }

      if (papel === undefined && senha === undefined) return res.status(400).json({ error: 'Nada para alterar.' });
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
