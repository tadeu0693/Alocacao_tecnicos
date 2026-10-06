import crypto from 'crypto';
import { getJSON, setJSON } from './_lib/db.js';
import { getUserFromReq, sendDbError } from './_lib/auth.js';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
function cleanAdmissao(v) { return v && ISO.test(String(v)) ? String(v) : ''; }
function cleanAjuste(v) {
  if (!v || !ISO.test(String(v.fim || ''))) return null;
  const dias = Math.max(0, Math.min(30, parseInt(v.dias, 10) || 0));
  return { fim: v.fim, dias };
}

function cleanFora(v) {
  return Array.isArray(v) ? v.map(String).slice(0, 100) : [];
}

function cleanPref(v) {
  if (!Array.isArray(v)) return [];
  return v.filter(p => p && ISO.test(String(p.inicio || '')) && ISO.test(String(p.fim || '')) && p.fim >= p.inicio)
    .slice(0, 10)
    .map(p => ({ id: String(p.id || Math.random().toString(36).slice(2)), inicio: p.inicio, fim: p.fim, notas: String(p.notas || '').slice(0, 200) }));
}

export default async function handler(req, res) {
  try {
    const user = await getUserFromReq(req);
    if (!user) return res.status(401).json({ error: 'Não autenticado.' });
    const isPlan = user.papel === 'planejador';
    const isTec = user.papel === 'tecnico';
    if (isTec) {
      if (req.method !== 'PATCH' || !['solicitar_troca','ferias_pref'].includes((req.body || {}).action) || req.query.id !== user.tecnicoId) return res.status(403).json({ error: 'Sem permissão.' });
    } else if (!['admin','editor','supervisor'].includes(user.papel) && !(isPlan && req.method === 'PATCH')) return res.status(403).json({ error: 'Sem permissão.' });

    if (req.method === 'POST') {
      const { nome, cargo, local, tipo, feriasLimite, admissao } = req.body || {};
      if (!nome || !String(nome).trim()) return res.status(400).json({ error: 'Nome é obrigatório.' });
      const tecnicos = await getJSON('tecnicos', []);
      const novo = { id: crypto.randomUUID(), nome: String(nome).trim().toUpperCase(), cargo: cargo || '', local: local || '', tipo: tipo || 'Implantação', feriasLimite: feriasLimite || '', admissao: cleanAdmissao(admissao), feriasAjuste: null, carro: '', ferramentas: '', material: '', epi: '' };
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
      const body = req.body || {};

      if (body.action === 'ferias_pref') {
        if (!isTec) return res.status(403).json({ error: 'Sem permissão.' });
        const nova = cleanPref(body.feriasPref);
        const atuais = (tecnicos[idx].feriasPref || []).map(p => p.id);
        const allocs = await getJSON('allocations', []);
        const outras = allocs.filter(a => a.ferias && a.tecnicoId !== id);
        for (const p of nova) {
          if (atuais.includes(p.id)) continue; // já existente
          if (outras.some(a => p.inicio <= a.fim && a.inicio <= p.fim)) return res.status(409).json({ error: 'Data não disponível: já existe outra pessoa de férias nesse período.' });
        }
        tecnicos[idx].feriasPref = nova;
        await setJSON('tecnicos', tecnicos);
        return res.status(200).json({ tecnico: tecnicos[idx] });
      }

      if (body.action === 'solicitar_troca') {
        if (!isTec) return res.status(403).json({ error: 'Sem permissão.' });
        const t = tecnicos[idx];
        const { tipo, item, motivo, descricao, filename, mimeType, dataBase64 } = body;
        if (!['ferramenta', 'epi'].includes(tipo)) return res.status(400).json({ error: 'Tipo inválido.' });
        if (!['Danificado', 'Perda'].includes(motivo)) return res.status(400).json({ error: 'Motivo inválido.' });
        const lista = String((tipo === 'epi' ? t.epi : t.ferramentas) || '').split('\n').map(x => x.trim()).filter(Boolean);
        if (!item || !lista.includes(item)) return res.status(400).json({ error: 'Item não está na sua lista.' });
        t.solicitacoes = t.solicitacoes || [];
        if (t.solicitacoes.some(x => x.status === 'Pendente' && x.tipo === tipo && x.item === item)) return res.status(400).json({ error: 'Já existe uma solicitação pendente para este item.' });
        const desc = String(descricao || '').trim().slice(0, 500);
        let fotoUrl = '', fotoNome = '';
        if (motivo === 'Perda') {
          if (desc.length < 5) return res.status(400).json({ error: 'Informe os detalhes da perda.' });
        }
        const sol = { id: crypto.randomUUID(), tipo, item, motivo, descricao: desc, fotoUrl, fotoNome, em: new Date().toISOString(), por: user.email, status: 'Pendente' };
        t.solicitacoes.push(sol);
        await setJSON('tecnicos', tecnicos);
        return res.status(200).json({ solicitacao: sol });
      }

      if (body.action === 'atender_troca') {
        const sol = (tecnicos[idx].solicitacoes || []).find(x => x.id === body.id);
        if (!sol) return res.status(404).json({ error: 'Solicitação não encontrada.' });
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.dataTroca || ''))) return res.status(400).json({ error: 'Informe a data da troca.' });
        sol.status = 'Atendida'; sol.dataTroca = body.dataTroca; sol.atendidaEm = new Date().toISOString(); sol.atendidaPor = user.email;
        await setJSON('tecnicos', tecnicos);
        return res.status(200).json({ ok: true });
      }

      const { feriasLimite, admissao, feriasAjuste, feriasPref, feriasFora } = body;
      const { nome, cargo, local, tipo, carro, ferramentas, material, epi } = isPlan ? {} : body;
      if (carro !== undefined) tecnicos[idx].carro = String(carro).trim().slice(0, 120);
      if (ferramentas !== undefined) tecnicos[idx].ferramentas = String(ferramentas).slice(0, 3000);
      if (material !== undefined) tecnicos[idx].material = String(material).slice(0, 3000);
      if (epi !== undefined) tecnicos[idx].epi = String(epi).slice(0, 3000);
      if (nome !== undefined) tecnicos[idx].nome = String(nome).trim().toUpperCase();
      if (cargo !== undefined) tecnicos[idx].cargo = cargo;
      if (local !== undefined) tecnicos[idx].local = local;
      if (tipo !== undefined) tecnicos[idx].tipo = tipo;
      if (feriasLimite !== undefined) tecnicos[idx].feriasLimite = feriasLimite;
      if (admissao !== undefined) tecnicos[idx].admissao = cleanAdmissao(admissao);
      if (feriasAjuste !== undefined) tecnicos[idx].feriasAjuste = cleanAjuste(feriasAjuste);
      if (feriasPref !== undefined) tecnicos[idx].feriasPref = cleanPref(feriasPref);
      if (feriasFora !== undefined) tecnicos[idx].feriasFora = cleanFora(feriasFora);
      await setJSON('tecnicos', tecnicos);
      return res.status(200).json({ tecnico: tecnicos[idx] });
    }

    res.status(405).json({ error: 'Método não permitido.' });
  } catch (e) {
    if (sendDbError(res, e)) return;
    res.status(500).json({ error: 'Erro interno.' });
  }
}
