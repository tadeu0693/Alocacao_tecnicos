import crypto from 'crypto';
import { getJSON, setJSON } from './_lib/db.js';
import { getUserFromReq, sendDbError } from './_lib/auth.js';

export default async function handler(req, res) {
  try {
    const user = await getUserFromReq(req);
    if (!user) return res.status(401).json({ error: 'Não autenticado.' });
    if (!['admin','editor','supervisor'].includes(user.papel)) return res.status(403).json({ error: 'Sem permissão.' });

    if (req.method === 'POST') {
      const { nome, cargo, local, tipo, feriasLimite } = req.body || {};
      if (!nome || !String(nome).trim()) return res.status(400).json({ error: 'Nome é obrigatório.' });
      const tecnicos = await getJSON('tecnicos', []);
      const novo = { id: crypto.randomUUID(), nome: String(nome).trim().toUpperCase(), cargo: cargo || '', local: local || '', tipo: tipo || 'Implantação', feriasLimite: feriasLimite || '' };
      tecnicos.push(novo);
      await setJSON('tecnicos', tecnicos);
      return res.status(200).json({ tecnico: novo });
    }

    if (req.method === 'DELETE') {
      const id = req.query.id;
      if (!id) return res.status(400).json({ error: 'ID é obrigatório.' });
      let [tecnicos, allocations, usuarios] = await Promise.all([
        getJSON('tecnicos', []), getJSON('allocations', []), getJSON('usuarios', [])
      ]);
      tecnicos = tecnicos.filter(t => t.id !== id);
      allocations = allocations.filter(a => a.tecnicoId !== id);
      usuarios = usuarios.filter(u => !(u.papel === 'tecnico' && u.tecnicoId === id));
      await Promise.all([setJSON('tecnicos', tecnicos), setJSON('allocations', allocations), setJSON('usuarios', usuarios)]);
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'PATCH') {
      const id = req.query.id;
      if (!id) return res.status(400).json({ error: 'ID é obrigatório.' });
      const tecnicos = await getJSON('tecnicos', []);
      const idx = tecnicos.findIndex(t => t.id === id);
      if (idx === -1) return res.status(404).json({ error: 'Técnico não encontrado.' });
      const { nome, cargo, local, tipo, feriasLimite } = req.body || {};
      if (nome !== undefined) tecnicos[idx].nome = String(nome).trim().toUpperCase();
      if (cargo !== undefined) tecnicos[idx].cargo = cargo;
      if (local !== undefined) tecnicos[idx].local = local;
      if (tipo !== undefined) tecnicos[idx].tipo = tipo;
      if (feriasLimite !== undefined) tecnicos[idx].feriasLimite = feriasLimite;
      await setJSON('tecnicos', tecnicos);
      return res.status(200).json({ tecnico: tecnicos[idx] });
    }

    res.status(405).json({ error: 'Método não permitido.' });
  } catch (e) {
    if (sendDbError(res, e)) return;
    res.status(500).json({ error: 'Erro interno.' });
  }
}
