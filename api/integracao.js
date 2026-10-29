// Integração com o painel Fracttal (fracttal-painel).
// Usa os mesmos usuários da Central: só admin, editor, supervisor e planejador.
//
// POST /api/integracao?action=login   {email, senha}            -> {token, user}
// GET  /api/integracao?data=AAAA-MM-DD[&horaInicio=HH:MM&horaFim=HH:MM]
//                                                               -> técnicos + disponibilidade no dia
// GET  /api/integracao?os=39240                                 -> alocações já feitas para a OS
// POST /api/integracao  {os, tecnicoIds[], data, dataFim?, horaInicio?, horaFim?, local, endereco,
//                        latitude?, longitude?, servico?, notas?, forcar?}
//                                                               -> cria alocações no quadro
// DELETE /api/integracao?os=39240[&tecnicoId=...]               -> remove alocações da OS
import crypto from 'crypto';
import { getJSON, setJSON } from './_lib/db.js';
import { getUsers, checkPassword, createSession, publicUser, getUserFromReq, sendDbError } from './_lib/auth.js';

const PAPEIS_OK = ['admin', 'editor', 'supervisor', 'planejador'];
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^\d{2}:\d{2}$/;

function cors(req, res) {
  const permitidas = String(process.env.INTEGRACAO_ORIGENS || 'https://fracttal-painel.vercel.app')
    .split(',').map(s => s.trim()).filter(Boolean);
  const origin = req.headers.origin || '';
  if (permitidas.includes(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
}

const osKey = v => String(v || '').replace(/\D/g, '');

function sobrepoe(a, data, hi, hf) {
  if (!(a.inicio <= data && data <= a.fim)) return false;
  if (a.ferias || !hi || !hf || !a.horaInicio || !a.horaFim) return true; // dia inteiro
  return a.horaInicio < hf && hi < a.horaFim;
}

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    if (req.method === 'POST' && req.query.action === 'login') {
      const { email, senha } = req.body || {};
      const users = await getUsers();
      const u = users.find(x => x.email === String(email || '').trim().toLowerCase());
      if (!u || !(await checkPassword(senha || '', u.senhaHash))) return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
      if (!PAPEIS_OK.includes(u.papel)) return res.status(403).json({ error: 'Seu usuário não tem acesso ao agendamento.' });
      return res.status(200).json({ token: await createSession(u.id), user: publicUser(u) });
    }

    const user = await getUserFromReq(req);
    if (!user) return res.status(401).json({ error: 'Não autenticado.' });
    if (!PAPEIS_OK.includes(user.papel)) return res.status(403).json({ error: 'Sem permissão.' });

    if (req.method === 'GET') {
      const [tecnicos, allocations] = await Promise.all([getJSON('tecnicos', []), getJSON('allocations', [])]);
      if (req.query.os) {
        const k = osKey(req.query.os);
        const nome = id => (tecnicos.find(t => t.id === id) || {}).nome || '';
        return res.status(200).json({
          allocations: allocations.filter(a => a.fracttalOS && osKey(a.fracttalOS) === k)
            .map(a => ({ id: a.id, tecnicoId: a.tecnicoId, tecnico: nome(a.tecnicoId), inicio: a.inicio, fim: a.fim, horaInicio: a.horaInicio, horaFim: a.horaFim }))
        });
      }
      const data = String(req.query.data || new Date().toISOString().slice(0, 10));
      if (!ISO.test(data)) return res.status(400).json({ error: 'Data inválida.' });
      const hi = HORA.test(req.query.horaInicio || '') ? req.query.horaInicio : '';
      const hf = HORA.test(req.query.horaFim || '') ? req.query.horaFim : '';
      const lista = tecnicos.map(t => {
        const doDia = allocations.filter(a => a.tecnicoId === t.id && a.inicio <= data && data <= a.fim && !(a.ferias && a.statusFerias === 'Reprovado'));
        const ferias = doDia.some(a => a.ferias);
        const conflitos = doDia.filter(a => sobrepoe(a, data, hi, hf));
        return {
          id: t.id, nome: t.nome, cargo: t.cargo || '', local: t.local || '', tipo: t.tipo || '',
          ferias,
          livre: conflitos.length === 0,
          ocupacoes: doDia.map(a => ({ obra: a.ferias ? 'Férias' : a.obra, local: a.local || '', horaInicio: a.horaInicio || '', horaFim: a.horaFim || '', fracttalOS: a.fracttalOS || '' }))
        };
      }).sort((a, b) => (b.livre - a.livre) || a.nome.localeCompare(b.nome));
      return res.status(200).json({ data, tecnicos: lista });
    }

    if (req.method === 'POST') {
      const b = req.body || {};
      const os = String(b.os || '').trim();
      const ids = Array.isArray(b.tecnicoIds) ? [...new Set(b.tecnicoIds.map(String))] : [];
      const inicio = String(b.data || '');
      const fim = String(b.dataFim || b.data || '');
      const hi = HORA.test(b.horaInicio || '') ? b.horaInicio : '';
      const hf = HORA.test(b.horaFim || '') ? b.horaFim : '';
      if (!os || !ids.length || !ISO.test(inicio) || !ISO.test(fim) || fim < inicio) return res.status(400).json({ error: 'Informe OS, técnico(s) e data.' });
      if ((hi && !hf) || (!hi && hf) || (hi && hf && hf <= hi)) return res.status(400).json({ error: 'Horário inválido.' });

      const [tecnicos, allocations] = await Promise.all([getJSON('tecnicos', []), getJSON('allocations', [])]);
      const k = osKey(os);
      const erros = [];
      for (const id of ids) {
        const t = tecnicos.find(x => x.id === id);
        if (!t) { erros.push({ tecnicoId: id, erro: 'Técnico não encontrado.' }); continue; }
        const dele = allocations.filter(a => a.tecnicoId === id && a.inicio <= fim && inicio <= a.fim);
        if (dele.some(a => a.ferias && a.statusFerias !== 'Reprovado')) { erros.push({ tecnicoId: id, tecnico: t.nome, erro: 'Técnico de férias no período.' }); continue; }
        if (dele.some(a => a.fracttalOS && osKey(a.fracttalOS) === k)) { erros.push({ tecnicoId: id, tecnico: t.nome, erro: 'Já agendado nesta OS.' }); continue; }
        const conf = dele.filter(a => inicio === fim ? sobrepoe(a, inicio, hi, hf) : true);
        if (conf.length && !b.forcar) erros.push({ tecnicoId: id, tecnico: t.nome, conflito: true, erro: 'Conflito com: ' + conf.map(a => a.obra + (a.horaInicio ? ` (${a.horaInicio}–${a.horaFim})` : '')).join(', ') });
      }
      if (erros.length) return res.status(409).json({ error: 'Não foi possível agendar.', detalhes: erros });

      const criadas = ids.map(id => ({
        id: crypto.randomUUID(), tecnicoId: id, projetoId: null, tipo: 'Manutenção',
        obra: `OS ${os}` + (b.servico ? ` - ${String(b.servico).slice(0, 120)}` : ''),
        local: String(b.local || '').slice(0, 200), endereco: String(b.endereco || '').slice(0, 300),
        latitude: b.latitude ? String(b.latitude) : '', longitude: b.longitude ? String(b.longitude) : '',
        inicio, fim, horaInicio: hi, horaFim: hf, notas: String(b.notas || '').slice(0, 1000),
        anexos: [], horasExtras: [], despesas: [], emergencial: false, ferias: false, statusFerias: null, diasVendidos: 0,
        origem: 'fracttal', fracttalOS: os, criadoPor: user.email, criadoEm: new Date().toISOString()
      }));
      await setJSON('allocations', allocations.concat(criadas));
      return res.status(200).json({ allocations: criadas });
    }

    if (req.method === 'DELETE') {
      const k = osKey(req.query.os);
      if (!k) return res.status(400).json({ error: 'Informe a OS.' });
      const tid = req.query.tecnicoId ? String(req.query.tecnicoId) : null;
      const allocations = await getJSON('allocations', []);
      const resto = allocations.filter(a => !(a.fracttalOS && osKey(a.fracttalOS) === k && (!tid || a.tecnicoId === tid)));
      await setJSON('allocations', resto);
      return res.status(200).json({ removidas: allocations.length - resto.length });
    }

    res.status(405).json({ error: 'Método não permitido.' });
  } catch (e) {
    if (sendDbError(res, e)) return;
    console.error(e);
    res.status(500).json({ error: 'Erro interno.' });
  }
}
