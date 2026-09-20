const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const admin = require('firebase-admin');

const app = express();
const PORT = Number(process.env.PORT || 10000);
const FRONTEND_URL = String(process.env.FRONTEND_URL || '').replace(/\/$/, '');
const PUBLIC_API_URL = String(process.env.PUBLIC_API_URL || '').replace(/\/$/, '');
const MP_ACCESS_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN || '';
const ADMIN_UIDS = new Set(String(process.env.ADMIN_UIDS || '').split(',').map(v => v.trim()).filter(Boolean));

let db = null;
if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    db = admin.firestore();
    console.log('Firebase Admin: ativo.');
  } catch (err) {
    console.error('Firebase Admin: configuração inválida:', err.message);
  }
} else {
  console.warn('Firebase Admin: FIREBASE_SERVICE_ACCOUNT_JSON não configurado.');
}

if (!MP_ACCESS_TOKEN) console.warn('Mercado Pago: MERCADOPAGO_ACCESS_TOKEN não configurado.');
if (!FRONTEND_URL) console.warn('CORS/retorno: FRONTEND_URL não configurado.');
if (!PUBLIC_API_URL) console.warn('Webhook: PUBLIC_API_URL não configurado.');
if (!ADMIN_UIDS.size) console.warn('Admin: ADMIN_UIDS não configurado.'); else console.log(`Admin: ${ADMIN_UIDS.size} UID(s) autorizado(s).`);

const catalog = {
  coins300: { id: 'coins300', kind: 'coins', title: '300 Moedas', price: 2.50, amount: 300 },
  coins600: { id: 'coins600', kind: 'coins', title: '600 Moedas', price: 5.00, amount: 600 },
  coins1000: { id: 'coins1000', kind: 'coins', title: '1.000 Moedas', price: 10.00, amount: 1000 },
  coins5000: { id: 'coins5000', kind: 'coins', title: '5.000 Moedas', price: 50.00, amount: 5000 },
  coins10000: { id: 'coins10000', kind: 'coins', title: '10.000 Moedas', price: 95.00, amount: 10000 },
  'theme-navy': { id: 'theme-navy', kind: 'theme', title: 'Tema Azul-marinho', price: 5.00, theme: 'navy' },
  'theme-red': { id: 'theme-red', kind: 'theme', title: 'Tema Vermelho', price: 5.00, theme: 'red' },
  'theme-lightgreen': { id: 'theme-lightgreen', kind: 'theme', title: 'Tema Verde', price: 5.00, theme: 'lightgreen' },
  'theme-neon': { id: 'theme-neon', kind: 'theme', title: 'Tema Verde neon', price: 5.00, theme: 'neon' },
  'theme-orange': { id: 'theme-orange', kind: 'theme', title: 'Tema Laranja', price: 5.00, theme: 'orange' },
  'theme-black': { id: 'theme-black', kind: 'theme', title: 'Tema Preto', price: 5.00, theme: 'black' },
  'theme-white': { id: 'theme-white', kind: 'theme', title: 'Tema Branco', price: 5.00, theme: 'white' },
  'theme-pink': { id: 'theme-pink', kind: 'theme', title: 'Tema Rosa', price: 5.00, theme: 'pink' }
};
for (let i = 1; i <= 20; i++) catalog[`border-${i}`] = { id: `border-${i}`, kind: 'border', title: `Borda ${String(i).padStart(2,'0')}`, price: 10.00, border: String(i) };

app.use(cors({
  origin: true,
  credentials: false
}));
app.use(express.json({ limit: '256kb' }));

app.get('/health', (_req, res) => res.json({
  ok: true,
  service: 'brasil-quiz-biblico-backend',
  firebaseAdmin: !!admin.apps.length && !!db,
  mercadoPago: !!MP_ACCESS_TOKEN,
  frontendConfigured: !!FRONTEND_URL,
  publicApiConfigured: !!PUBLIC_API_URL
}));

function requireMp(res) {
  if (!MP_ACCESS_TOKEN) {
    res.status(503).json({ error: 'Mercado Pago não configurado no servidor.' });
    return false;
  }
  return true;
}

async function verifyFirebaseUser(req, res) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Sessão do usuário ausente.' });
    return null;
  }
  if (!admin.apps.length) {
    res.status(503).json({ error: 'Firebase Admin não configurado no servidor.' });
    return null;
  }
  try {
    return await admin.auth().verifyIdToken(header.slice(7));
  } catch (_err) {
    res.status(401).json({ error: 'Sessão inválida ou expirada.' });
    return null;
  }
}

async function requireAdmin(req, res) {
  const user = await verifyFirebaseUser(req, res);
  if (!user) return null;
  if (!ADMIN_UIDS.has(String(user.uid))) {
    res.status(403).json({ error: 'Acesso restrito ao administrador.' });
    return null;
  }
  return user;
}

function adminReady(res) {
  if (!admin.apps.length || !db) {
    res.status(503).json({ error: 'Firebase Admin não configurado no servidor.' });
    return false;
  }
  if (!ADMIN_UIDS.size) {
    res.status(503).json({ error: 'ADMIN_UIDS não configurado no servidor.' });
    return false;
  }
  return true;
}

function cleanAdminProfile(data) {
  if (!data) return null;
  return {
    uid: String(data.uid || ''),
    name: String(data.name || 'Jogador').slice(0, 40),
    email: String(data.email || '').slice(0, 120),
    photo: data.photo || null,
    coins: Number(data.coins || 0),
    disabled: !!data.disabled,
    updatedAt: data.updatedAt || null
  };
}

async function writeAdminAction(adminUser, action, targetUid, details = {}) {
  if (!db) return;
  await db.collection('adminActions').add({
    adminUid: String(adminUser.uid),
    action: String(action),
    targetUid: String(targetUid || ''),
    details,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
}

app.get('/admin/me', async (req, res) => {
  if (!adminReady(res)) return;
  const user = await requireAdmin(req, res); if (!user) return;
  res.json({ ok: true, uid: user.uid, email: user.email || null, admin: true });
});

app.get('/admin/users', async (req, res) => {
  if (!adminReady(res)) return;
  const user = await requireAdmin(req, res); if (!user) return;
  const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 1000);
  try {
    const result = await admin.auth().listUsers(limit);
    const users = await Promise.all(result.users.map(async u => {
      const snap = await db.collection('profiles').doc(u.uid).get();
      const profile = snap.exists ? cleanAdminProfile(snap.data()) : null;
      return {
        uid: u.uid,
        email: u.email || profile?.email || '',
        name: profile?.name || u.displayName || 'Jogador',
        photo: profile?.photo || u.photoURL || null,
        coins: profile?.coins || 0,
        disabled: !!u.disabled,
        createdAt: u.metadata?.creationTime || null,
        lastSignInAt: u.metadata?.lastSignInTime || null
      };
    }));
    res.json({ ok: true, users, nextPageToken: result.pageToken || null });
  } catch (err) {
    console.error('admin/users:', err.message);
    res.status(500).json({ error: 'Não foi possível carregar os usuários.' });
  }
});

app.get('/admin/users/:uid', async (req, res) => {
  if (!adminReady(res)) return;
  const adminUser = await requireAdmin(req, res); if (!adminUser) return;
  const uid = String(req.params.uid || '');
  try {
    const authUser = await admin.auth().getUser(uid);
    const snap = await db.collection('profiles').doc(uid).get();
    res.json({ ok: true, user: {
      uid: authUser.uid,
      email: authUser.email || '',
      name: snap.exists ? (snap.data().name || authUser.displayName || 'Jogador') : (authUser.displayName || 'Jogador'),
      disabled: !!authUser.disabled,
      profile: snap.exists ? cleanAdminProfile(snap.data()) : null
    }});
  } catch (err) {
    res.status(err.code === 'auth/user-not-found' ? 404 : 500).json({ error: 'Usuário não encontrado.' });
  }
});

app.post('/admin/users/:uid/status', async (req, res) => {
  if (!adminReady(res)) return;
  const adminUser = await requireAdmin(req, res); if (!adminUser) return;
  const uid = String(req.params.uid || '');
  if (!uid) return res.status(400).json({ error: 'UID inválido.' });
  const disabled = !!req.body?.disabled;
  if (uid === adminUser.uid) return res.status(400).json({ error: 'O administrador não pode bloquear a própria conta.' });
  try {
    await admin.auth().updateUser(uid, { disabled });
    await db.collection('profiles').doc(uid).set({ disabled, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    await writeAdminAction(adminUser, disabled ? 'disable_user' : 'enable_user', uid, { disabled });
    res.json({ ok: true, uid, disabled });
  } catch (err) {
    console.error('admin/user-status:', err.message);
    res.status(500).json({ error: 'Não foi possível alterar o status do usuário.' });
  }
});

app.post('/admin/users/:uid/coins', async (req, res) => {
  if (!adminReady(res)) return;
  const adminUser = await requireAdmin(req, res); if (!adminUser) return;
  const uid = String(req.params.uid || '');
  const delta = Number(req.body?.delta);
  if (!uid || !Number.isFinite(delta) || !Number.isInteger(delta) || Math.abs(delta) > 1000000) {
    return res.status(400).json({ error: 'Valor de moedas inválido.' });
  }
  try {
    const ref = db.collection('profiles').doc(uid);
    const result = await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const current = snap.exists ? Number(snap.data().coins || 0) : 0;
      const next = Math.max(0, current + delta);
      tx.set(ref, { uid, coins: next, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return { current, next };
    });
    await writeAdminAction(adminUser, 'adjust_coins', uid, { delta, from: result.current, to: result.next });
    res.json({ ok: true, uid, coins: result.next });
  } catch (err) {
    console.error('admin/coins:', err.message);
    res.status(500).json({ error: 'Não foi possível alterar as moedas.' });
  }
});

app.get('/admin/actions', async (req, res) => {
  if (!adminReady(res)) return;
  const adminUser = await requireAdmin(req, res); if (!adminUser) return;
  const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 200);
  try {
    const snap = await db.collection('adminActions').orderBy('createdAt', 'desc').limit(limit).get();
    res.json({ ok: true, actions: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
  } catch (err) {
    console.error('admin/actions:', err.message);
    res.status(500).json({ error: 'Não foi possível carregar o histórico administrativo.' });
  }
});


function encodeOrder(order) {
  return Buffer.from(JSON.stringify(order), 'utf8').toString('base64url');
}
function decodeOrder(value) {
  try { return JSON.parse(Buffer.from(String(value), 'base64url').toString('utf8')); } catch { return null; }
}

async function mpRequest(path, options = {}) {
  const response = await fetch(`https://api.mercadopago.com${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.message || data?.error || `Mercado Pago HTTP ${response.status}`;
    const err = new Error(message); err.status = response.status; err.data = data; throw err;
  }
  return data;
}

app.post('/api/create-preference', async (req, res) => {
  if (!requireMp(res)) return;
  const user = await verifyFirebaseUser(req, res); if (!user) return;
  const { itemId } = req.body || {};
  const item = catalog[String(itemId || '')];
  if (!item) return res.status(400).json({ error: 'Produto inválido.' });

  const orderId = crypto.randomUUID();
  const order = { orderId, uid: user.uid, itemId: item.id, kind: item.kind, amount: item.amount || 0, theme: item.theme || null, border: item.border || null, price: item.price, createdAt: new Date().toISOString() };
  const back = FRONTEND_URL || 'http://localhost:5500';
  const preference = {
    items: [{ id: item.id, title: item.title, quantity: 1, currency_id: 'BRL', unit_price: item.price }],
    external_reference: encodeOrder(order),
    metadata: order,
    back_urls: { success: back, pending: back, failure: back },
    auto_return: 'approved'
  };
  if (PUBLIC_API_URL) preference.notification_url = `${PUBLIC_API_URL}/api/mercadopago/webhook`;

  try {
    const created = await mpRequest('/checkout/preferences', { method: 'POST', body: JSON.stringify(preference) });
    if (db) await db.collection('orders').doc(orderId).set({ ...order, preferenceId: created.id, status: 'created', createdAt: admin.firestore.FieldValue.serverTimestamp() });
    res.json({ init_point: created.init_point, preference_id: created.id, order_id: orderId });
  } catch (err) {
    console.error('create-preference:', err.message);
    res.status(502).json({ error: 'Não foi possível criar o checkout.' });
  }
});

async function fulfillApprovedPayment(payment, order) {
  if (!db) return { fulfilled: false };
  const ref = db.collection('orders').doc(order.orderId);
  let result = { fulfilled: false };
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (snap.exists && snap.data().fulfilledAt) { result = { fulfilled: true, already: true }; return; }
    const profileRef = db.collection('profiles').doc(order.uid);
    const profileSnap = await tx.get(profileRef);
    const profile = profileSnap.exists ? profileSnap.data() : { uid: order.uid, coins: 0, shopOwned: {} };
    const owned = { ...(profile.shopOwned || {}) };
    if (order.kind === 'coins') profile.coins = Number(profile.coins || 0) + Number(order.amount || 0);
    else owned[order.itemId] = true;
    profile.shopOwned = owned;
    profile.uid = order.uid;
    profile.updatedAt = admin.firestore.FieldValue.serverTimestamp();
    tx.set(profileRef, profile, { merge: true });
    tx.set(ref, { ...order, paymentId: String(payment.id), status: 'approved', fulfilledAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    result = { fulfilled: true, already: false, profile };
  });
  return result;
}

app.get('/api/payment-status', async (req, res) => {
  if (!requireMp(res)) return;
  const user = await verifyFirebaseUser(req, res); if (!user) return;
  const paymentId = String(req.query.payment_id || '');
  if (!/^\d+$/.test(paymentId)) return res.status(400).json({ error: 'payment_id inválido.' });
  try {
    const payment = await mpRequest(`/v1/payments/${encodeURIComponent(paymentId)}`, { method: 'GET' });
    const order = decodeOrder(payment.external_reference);
    if (!order || order.uid !== user.uid || !catalog[order.itemId]) return res.status(403).json({ error: 'Pagamento não pertence ao usuário.' });
    const expected = catalog[order.itemId];
    if (Math.abs(Number(payment.transaction_amount || 0) - expected.price) > 0.01) return res.status(409).json({ error: 'Valor do pagamento não confere.' });

    let fulfillment = { fulfilled: false };
    if (payment.status === 'approved') fulfillment = await fulfillApprovedPayment(payment, order);
    res.json({ status: payment.status, status_detail: payment.status_detail, itemId: order.itemId, kind: order.kind, amount: order.amount || 0, theme: order.theme || null, border: order.border || null, fulfilled: fulfillment.fulfilled, coins: fulfillment.profile?.coins, owned: fulfillment.profile?.shopOwned || null });
  } catch (err) {
    console.error('payment-status:', err.message);
    res.status(502).json({ error: 'Não foi possível consultar o pagamento.' });
  }
});

app.post('/api/mercadopago/webhook', async (req, res) => {
  // O Mercado Pago envia o ID do pagamento em data.id.
  // O servidor consulta a API do Mercado Pago antes de liberar qualquer item.
  try {
    if (!MP_ACCESS_TOKEN || !db) return res.sendStatus(200);

    const type = String(req.body?.type || req.query?.type || '');
    if (type && type !== 'payment') return res.sendStatus(200);

    const paymentId = String(
      req.body?.data?.id ||
      req.query?.['data.id'] ||
      req.body?.id ||
      ''
    );

    if (!/^\d+$/.test(paymentId)) return res.sendStatus(200);

    const payment = await mpRequest(
      `/v1/payments/${encodeURIComponent(paymentId)}`,
      { method: 'GET' }
    );

    if (payment.status !== 'approved') return res.sendStatus(200);

    const order = decodeOrder(payment.external_reference);
    if (!order || !order.orderId || !order.uid || !catalog[order.itemId]) {
      console.error('webhook: pedido inválido:', paymentId);
      return res.sendStatus(200);
    }

    const expected = catalog[order.itemId];
    if (
      Math.abs(
        Number(payment.transaction_amount || 0) -
        Number(expected.price)
      ) > 0.01
    ) {
      console.error('webhook: valor do pagamento não confere:', paymentId);
      return res.sendStatus(200);
    }

    await fulfillApprovedPayment(payment, order);
    console.log(
      `webhook: pagamento ${paymentId} aprovado e item ${order.itemId} processado para ${order.uid}.`
    );

    return res.sendStatus(200);
  } catch (err) {
    console.error('mercadopago/webhook:', err.message);
    return res.sendStatus(500);
  }
});

app.listen(PORT, () => console.log(`Brasil Quiz Bíblico backend em http://localhost:${PORT}`));
