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
    if (user.papel === 'tecnico') {
      const key = a => (a.obra || '').trim().toLowerCase();
      const nome = id => (tecnicos.find(t => t.id === id) || {}).nome;
      const mine = allocations.filter(a => a.tecnicoId === user.tecnicoId).map(a => ({
        ...a,
        colegas: (!key(a) || a.tipo === 'Indisponibilidade') ? [] : [...new Set(
          allocations.filter(b => b.id !== a.id && b.tecnicoId !== a.tecnicoId && key(b) === key(a) && b.inicio <= a.fim && a.inicio <= b.fim)
            .map(b => nome(b.tecnicoId)).filter(Boolean))]
      }));
      const pids = new Set(mine.map(a => a.projetoId).filter(Boolean));
      return res.status(200).json({
        tecnicos: tecnicos.filter(t => t.id === user.tecnicoId).map(({ carro, material, ...resto }) => resto),
        projetos: projetos.filter(p => pids.has(p.id)),
        allocations: mine
      });
    }
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
