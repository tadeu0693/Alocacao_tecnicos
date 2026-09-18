import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { getJSON, setJSON, delKey } from './db.js';

export async function getUsers() { return await getJSON('usuarios', []); }
export async function saveUsers(list) { await setJSON('usuarios', list); }

export async function hashPassword(pw) { return bcrypt.hash(pw, 10); }
export async function checkPassword(pw, hash) { return bcrypt.compare(pw, hash); }

export async function createSession(userId) {
  const token = crypto.randomBytes(24).toString('hex');
  await setJSON('session:' + token, userId);
  return token;
}
export async function destroySession(token) {
  if (token) await delKey('session:' + token);
}

export async function getUserFromReq(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  const userId = await getJSON('session:' + token, null);
  if (!userId) return null;
  const users = await getUsers();
  return users.find(u => u.id === userId) || null;
}

export function publicUser(u) {
  return u ? { id: u.id, email: u.email, papel: u.papel, tecnicoId: u.tecnicoId || null } : null;
}

// Retorna true (e já respondeu) se o erro for de banco não configurado ainda.
export function sendDbError(res, e) {
  if (e && e.message === 'DB_NOT_CONFIGURED') {
    res.status(500).json({
      error: 'Banco de dados ainda não conectado a este projeto. No painel da Vercel: Storage → Connect Store → Upstash (Redis, plano gratuito) → conecte a este projeto → Redeploy.'
    });
    return true;
  }
  return false;
}
