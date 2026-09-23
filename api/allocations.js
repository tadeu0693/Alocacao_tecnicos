import crypto from 'crypto';
import { getJSON, setJSON } from './_lib/db.js';
import { getUserFromReq, sendDbError } from './_lib/auth.js';

function addDaysISO(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Quando uma alocação de emergência é criada num dia específico, "abre espaço" nas
// alocações já existentes do técnico naquele dia: divide a alocação original em pedaços
// antes/depois do dia (ou antes/depois do horário, se for só um horário específico),
// para que o técnico volte ao projeto de origem automaticamente depois da emergência.
function reallocateForEmergency(allocations, tecnicoId, date, modo, emHoraInicio, emHoraFim, excludeId) {
  const others = allocations.filter(a =>
    a.id !== excludeId && a.tecnicoId === tecnicoId &&
    a.inicio <= date && date <= a.fim
  );
  others.forEach(orig => {
    const pieces = [];
    if (orig.inicio < date) pieces.push({ ...orig, id: crypto.randomUUID(), fim: addDaysISO(date, -1) });
    if (orig.fim > date) pieces.push({ ...orig, id: crypto.randomUUID(), inicio: addDaysISO(date, 1) });
    if (modo === 'horario' && emHoraInicio && emHoraFim) {
      const dayStart = orig.horaInicio || '08:00';
      const dayEnd = orig.horaFim || '18:00';
      if (emHoraInicio > dayStart) {
        pieces.push({ ...orig, id: crypto.randomUUID(), inicio: date, fim: date, horaInicio: dayStart, horaFim: emHoraInicio });
      }
      if (emHoraFim < dayEnd) {
        pieces.push({ ...orig, id: crypto.randomUUID(), inicio: date, fim: date, horaInicio: emHoraFim, horaFim: dayEnd });
      }
    }
    allocations = allocations.filter(a => a.id !== orig.id).concat(pieces);
  });
  return allocations;
}

export default async function handler(req, res) {
  try {
    const user = await getUserFromReq(req);
    if (!user) return res.status(401).json({ error: 'Não autenticado.' });

    if (req.method === 'POST') {
      if (!['admin','editor','supervisor'].includes(user.papel)) return res.status(403).json({ error: 'Sem permissão.' });
      const { tecnicoId, projetoId, tipo, obra, local, endereco, latitude, longitude, inicio, fim, horaInicio, horaFim, notas, emergencial, emergencialModo, ferias, statusFerias } = req.body || {};
      if (!tecnicoId || !obra || !inicio || !fim) return res.status(400).json({ error: 'Dados incompletos.' });
      let allocations = await getJSON('allocations', []);
      const novo = { id: crypto.randomUUID(), tecnicoId, projetoId: projetoId || null, tipo: tipo || 'Implantação', obra, local: local || '', endereco: endereco || '', latitude: latitude || '', longitude: longitude || '', inicio, fim, horaInicio: horaInicio || '', horaFim: horaFim || '', notas: notas || '', anexos: [], horasExtras: [], despesas: [], emergencial: !!emergencial, ferias: !!ferias, statusFerias: statusFerias || null };
      allocations.push(novo);
      if (emergencial && inicio === fim) {
        allocations = reallocateForEmergency(allocations, tecnicoId, inicio, emergencialModo || 'dia', horaInicio, horaFim, novo.id);
      }
      await setJSON('allocations', allocations);
      return res.status(200).json({ allocation: novo });
    }

    if (req.method === 'DELETE') {
      if (!['admin','editor','supervisor'].includes(user.papel)) return res.status(403).json({ error: 'Sem permissão.' });
      const id = req.query.id;
      if (!id) return res.status(400).json({ error: 'ID é obrigatório.' });
      let allocations = await getJSON('allocations', []);
      allocations = allocations.filter(a => a.id !== id);
      await setJSON('allocations', allocations);
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'PATCH') {
      const id = req.query.id;
      if (!id) return res.status(400).json({ error: 'ID é obrigatório.' });
      const allocations = await getJSON('allocations', []);
      const idx = allocations.findIndex(a => a.id === id);
      if (idx === -1) return res.status(404).json({ error: 'Alocação não encontrada.' });
      const alloc = allocations[idx];
      const isOwner = user.papel === 'tecnico' && user.tecnicoId === alloc.tecnicoId;
      const canManage = ['admin','editor','supervisor','planejador'].includes(user.papel);
      if (!isOwner && !canManage) return res.status(403).json({ error: 'Sem permissão.' });

      const { action } = req.body || {};

      if (action === 'add_anexo') {
        if (!process.env.BLOB_READ_WRITE_TOKEN) {
          return res.status(500).json({ error: 'Armazenamento de arquivos ainda não conectado a este projeto. No painel da Vercel: Storage → Connect Store → Blob → conecte a este projeto → Redeploy.' });
        }
        const { filename, mimeType, dataBase64 } = req.body || {};
        if (!filename || !dataBase64) return res.status(400).json({ error: 'Arquivo inválido.' });
        const buffer = Buffer.from(dataBase64, 'base64');
        if (buffer.length > 8 * 1024 * 1024) return res.status(400).json({ error: 'Arquivo muito grande (máx. 8MB).' });
        const { put } = await import('@vercel/blob');
        const safeName = String(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
        const blob = await put(`anexos/${id}/${Date.now()}-${safeName}`, buffer, {
          access: 'public',
          contentType: mimeType || 'application/octet-stream'
        });
        alloc.anexos = alloc.anexos || [];
        const anexo = { url: blob.url, nome: filename, tipo: mimeType || '', em: new Date().toISOString(), por: user.email };
        alloc.anexos.push(anexo);
        allocations[idx] = alloc;
        await setJSON('allocations', allocations);
        return res.status(200).json({ anexo });
      }

      if (action === 'remove_anexo') {
        const { url } = req.body || {};
        if (!url) return res.status(400).json({ error: 'URL é obrigatória.' });
        alloc.anexos = (alloc.anexos || []).filter(a => a.url !== url);
        allocations[idx] = alloc;
        await setJSON('allocations', allocations);
        try {
          const { del } = await import('@vercel/blob');
          await del(url);
        } catch (e) { /* ignora falha ao apagar do storage */ }
        return res.status(200).json({ ok: true });
      }

      if (action === 'add_hora_extra') {
        const { data, horas, notas: notaHE } = req.body || {};
        const horasNum = parseFloat(String(horas).replace(',', '.'));
        if (!data || isNaN(horasNum) || horasNum <= 0) return res.status(400).json({ error: 'Informe a data e uma quantidade de horas válida.' });
        alloc.horasExtras = alloc.horasExtras || [];
        const entry = { id: crypto.randomUUID(), data, horas: horasNum, notas: notaHE || '', por: user.email };
        alloc.horasExtras.push(entry);
        allocations[idx] = alloc;
        await setJSON('allocations', allocations);
        return res.status(200).json({ entry });
      }

      if (action === 'remove_hora_extra') {
        const { id: entryId } = req.body || {};
        if (!entryId) return res.status(400).json({ error: 'ID é obrigatório.' });
        alloc.horasExtras = (alloc.horasExtras || []).filter(h => h.id !== entryId);
        allocations[idx] = alloc;
        await setJSON('allocations', allocations);
        return res.status(200).json({ ok: true });
      }

      if (action === 'add_despesa') {
        const { tipo: tipoDespesa, data, valor, notas: notaDesp } = req.body || {};
        if (!['Hotel', 'Refeição', 'Outro'].includes(tipoDespesa)) return res.status(400).json({ error: 'Tipo de despesa inválido.' });
        const valorNum = parseFloat(String(valor).replace(',', '.'));
        if (!data || isNaN(valorNum) || valorNum <= 0) return res.status(400).json({ error: 'Informe a data e um valor válido.' });
        alloc.despesas = alloc.despesas || [];
        const entry = { id: crypto.randomUUID(), tipo: tipoDespesa, data, valor: valorNum, notas: notaDesp || '', por: user.email };
        alloc.despesas.push(entry);
        allocations[idx] = alloc;
        await setJSON('allocations', allocations);
        return res.status(200).json({ entry });
      }

      if (action === 'remove_despesa') {
        const { id: entryId } = req.body || {};
        if (!entryId) return res.status(400).json({ error: 'ID é obrigatório.' });
        alloc.despesas = (alloc.despesas || []).filter(d => d.id !== entryId);
        allocations[idx] = alloc;
        await setJSON('allocations', allocations);
        return res.status(200).json({ ok: true });
      }

      if (action === 'edit_ferias') {
        if (!canManage) return res.status(403).json({ error: 'Sem permissão.' });
        const { inicio, fim, statusFerias, notas: notaF } = req.body || {};
        if (inicio !== undefined) alloc.inicio = inicio;
        if (fim !== undefined) alloc.fim = fim;
        if (statusFerias !== undefined) alloc.statusFerias = statusFerias;
        if (notaF !== undefined) alloc.notas = notaF;
        allocations[idx] = alloc;
        await setJSON('allocations', allocations);
        return res.status(200).json({ allocation: alloc });
      }

      return res.status(400).json({ error: 'Ação inválida.' });
    }

    res.status(405).json({ error: 'Método não permitido.' });
  } catch (e) {
    if (sendDbError(res, e)) return;
    console.error(e);
    res.status(500).json({ error: 'Erro interno.' });
  }
}
