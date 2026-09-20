# Brasil Quiz Bíblico — pacote de produção

## O que já foi corrigido

- Removidas as telas HTML duplicadas de Quiz e Cadastro.
- Removidos todos os IDs HTML duplicados.
- Login e cadastro preparados para Firebase Authentication com e-mail/senha.
- Perfil sincronizado com Firestore quando o usuário está autenticado.
- Checkout preparado para backend separado no Render.
- O frontend envia o Firebase ID token ao backend para operações de pagamento.
- O backend valida o produto/preço no servidor antes de criar a preferência.
- O backend confirma o pagamento diretamente na API do Mercado Pago.
- Compras aprovadas podem ser registradas no Firestore pelo Firebase Admin.
- Regras do Firestore incluídas.
- Sintaxe do HTML/JavaScript e do backend foi validada localmente.

## Antes de publicar

1. Suba `index.html` na raiz do repositório GitHub.
2. Publique `backend/` como um Web Service no Render.
3. No Render configure `FRONTEND_URL`, `PUBLIC_API_URL`, `MERCADOPAGO_ACCESS_TOKEN` e `FIREBASE_SERVICE_ACCOUNT_JSON`.
4. Depois de saber a URL do Render, abra `index.html` e altere `window.BQ_API_BASE` para essa URL.
5. No Firebase Authentication ative E-mail/Senha.
6. Publique `backend/firestore.rules` no Firestore.
7. No GitHub Pages publique a branch `main` e a pasta `/root`.
8. Teste: cadastro → login → quiz → ranking → batalha → campeonato → loja → pagamento de teste.

### Importante

A chave privada do Mercado Pago deve ficar somente no Render. Nunca coloque `MERCADOPAGO_ACCESS_TOKEN` dentro do HTML ou do GitHub. A documentação oficial do Mercado Pago também orienta que a chave privada seja mantida no servidor.
