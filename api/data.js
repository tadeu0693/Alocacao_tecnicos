import { getJSON } from './_lib/db.js';
import { getUserFromReq, sendDbError } from './_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido.' });
  try {
    const user = await getUserFromReq(req);
    if (!user) return res.status(401).json({ error: 'Não autenticado.' });
    const [tecnicos, projetos, allocations, usuarios] = await Promise.all([
      getJSON('tecnicos', []), getJSON('projetos', []), getJSON('allocations', []), getJSON('usuarios', [])
    ]);
    const payload = { tecnicos, projetos, allocations };
    if (user.papel === 'admin') {
      payload.usuarios = usuarios.map(u => ({ id: u.id, email: u.email, papel: u.papel, tecnicoId: u.tecnicoId || null }));
    }
    res.status(200).json(payload);
  } catch (e) {
    if (sendDbError(res, e)) return;
    res.status(500).json({ error: 'Erro interno.' });
  }
}
