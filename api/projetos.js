import crypto from 'crypto';
import { getJSON, setJSON } from './_lib/db.js';
import { getUserFromReq, sendDbError } from './_lib/auth.js';

const FIELDS = ['nome','cliente','local','endereco','latitude','longitude','inicio','fim','horaInicio','horaFim','descricao','status'];

export default async function handler(req, res) {
  try {
    const user = await getUserFromReq(req);
    if (!user) return res.status(401).json({ error: 'Não autenticado.' });
    if (!['admin','editor','planejador'].includes(user.papel)) return res.status(403).json({ error: 'Sem permissão.' });

    if (req.method === 'POST') {
      const { nome, cliente, local, endereco, latitude, longitude, inicio, fim, horaInicio, horaFim, descricao, status } = req.body || {};
      if (!nome || !String(nome).trim()) return res.status(400).json({ error: 'Nome é obrigatório.' });
      const projetos = await getJSON('projetos', []);
      const novo = { id: crypto.randomUUID(), nome: String(nome).trim(), cliente: cliente || '', local: local || '', endereco: endereco || '', latitude: latitude || '', longitude: longitude || '', inicio: inicio || '', fim: fim || '', horaInicio: horaInicio || '', horaFim: horaFim || '', descricao: descricao || '', status: status || 'Planejado' };
      projetos.push(novo);
      await setJSON('projetos', projetos);
      return res.status(200).json({ projeto: novo });
    }

    if (req.method === 'DELETE') {
      const id = req.query.id;
      if (!id) return res.status(400).json({ error: 'ID é obrigatório.' });
      let projetos = await getJSON('projetos', []);
      projetos = projetos.filter(p => p.id !== id);
      await setJSON('projetos', projetos);
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'PATCH') {
      const id = req.query.id;
      if (!id) return res.status(400).json({ error: 'ID é obrigatório.' });
      const projetos = await getJSON('projetos', []);
      const idx = projetos.findIndex(p => p.id === id);
      if (idx === -1) return res.status(404).json({ error: 'Projeto não encontrado.' });
      const before = { ...projetos[idx] };
      const body = req.body || {};
      FIELDS.forEach(f => { if (body[f] !== undefined) projetos[idx][f] = body[f]; });
      await setJSON('projetos', projetos);

      const cascadeFields = ['inicio', 'fim', 'horaInicio', 'horaFim', 'endereco', 'latitude', 'longitude'];
      const changed = cascadeFields.some(f => before[f] !== projetos[idx][f]);
      if (changed) {
        const allocations = await getJSON('allocations', []);
        let touched = false;
        allocations.forEach(a => {
          if (a.projetoId === id) {
            cascadeFields.forEach(f => { a[f] = projetos[idx][f]; });
            touched = true;
          }
        });
        if (touched) await setJSON('allocations', allocations);
      }

      return res.status(200).json({ projeto: projetos[idx] });
    }

    res.status(405).json({ error: 'Método não permitido.' });
  } catch (e) {
    if (sendDbError(res, e)) return;
    res.status(500).json({ error: 'Erro interno.' });
  }
}
