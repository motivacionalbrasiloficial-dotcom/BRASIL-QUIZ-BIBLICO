# Backend — Brasil Quiz Bíblico

Backend preparado para o frontend do Brasil Quiz Bíblico.

## Endpoints

- `GET /health`
- `POST /api/create-preference`
- `GET /api/payment-status?payment_id=...`
- `POST /api/mercadopago/webhook`

## Variáveis de ambiente no Render

- `FRONTEND_URL`
- `PUBLIC_API_URL`
- `MERCADOPAGO_ACCESS_TOKEN`
- `FIREBASE_SERVICE_ACCOUNT_JSON`

O frontend envia o Firebase ID token no header `Authorization: Bearer ...`; o backend valida esse token antes de criar ou consultar pagamentos.

O preço é validado no servidor a partir do catálogo, portanto o navegador não pode alterar o valor cobrado.
