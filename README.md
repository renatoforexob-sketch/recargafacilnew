# Recarga Fácil — Gateway Sharpify + BlackCat

O projeto mantém a interface original e agora possui um adaptador de gateway no backend.

## Gateway Sharpify

Defina na Vercel:

```env
PAYMENT_GATEWAY=sharpify
SHARPIFY_CLIENT_ID=...
SHARPIFY_CLIENT_SECRET=...
SHARPIFY_WEBHOOK_URL=https://SEU-DOMINIO.com/api/sharpify-webhook
```

A aplicação chama exclusivamente o backend (`/api/pix` e `/api/status`). As credenciais Sharpify nunca são enviadas ao navegador.

### Rotas usadas

- `POST https://sharpify-pay.com/api/v1/gateway/payment/create-paymnet`
- `GET https://sharpify-pay.com/api/v1/gateway/payment/get-payment?paymentLinkId=...`

O endpoint de criação envia `name`, `description`, `amount`, `gatewayMethod: "PIX"` e, quando configurado, `webhook.callbackURL`.

Para consulta, o `paymentLinkId` retornado pelo Sharpify é usado como identificador de transação no frontend.

## Webhook

Foi adicionada a rota:

`POST /api/sharpify-webhook`

Ela responde HTTP 200 e registra o `webhookId`, tipo e status. O Gateway pode reenviar eventos; antes de acoplar a entrega automática da recarga, use `event.webhookId` para deduplicação.

## BlackCat

Para voltar ao gateway anterior:

```env
PAYMENT_GATEWAY=blackcat
BLACKCAT_API_KEY=...
```

## Observação importante sobre a resposta do Sharpify

A documentação fornecida descreve o retorno como dados privados do link de pagamento, mas não especifica neste documento os nomes exatos dos campos de QR Code/copia-e-cola. O adaptador procura os nomes mais comuns (`paymentLinkId`, `copyPaste`, `qrCodeBase64`, `qrCode`, `paymentUrl` etc.). Se a conta Sharpify retornar nomes diferentes, basta ajustar o normalizador em `api/pix.js`.

Se o retorno tiver somente uma URL de pagamento e não houver PIX copia-e-cola/QR, o backend devolve `paymentUrl`; nesse caso o frontend pode ser ajustado para apresentar o botão/redirect para esse link.

## Vercel

Configure as variáveis em **Settings → Environment Variables** e faça um novo deploy.

Não coloque `SHARPIFY_CLIENT_SECRET` em arquivos públicos, HTML, JS do navegador ou código enviado ao cliente.

## Painel administrativo de gateway

Acesse `/admin` para alternar entre `Sharpify` e `BlackCat`.

Variáveis obrigatórias:

```env
ADMIN_PASSWORD=uma-senha-forte
ADMIN_SECRET=um-segredo-longo-e-aleatorio
```

Para a seleção do gateway ficar persistente e valer para todos os clientes, configure um Redis REST (Upstash ou Vercel KV):

```env
KV_REST_API_URL=https://...
KV_REST_API_TOKEN=...
```

ou:

```env
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
```

As credenciais `SHARPIFY_CLIENT_SECRET` e `BLACKCAT_API_KEY` continuam somente no backend. A escolha feita no painel é lida pelas APIs `/api/pix` e `/api/status`.
