export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Método não permitido' });

  // O Gateway pode reenviar o mesmo webhook. event.webhookId deve ser usado
  // para deduplicação quando você conectar aqui a lógica de processamento da recarga.
  const event = req.body || {};
  console.log('Sharpify webhook recebido:', JSON.stringify({
    webhookId: event?.event?.webhookId || event?.webhookId || null,
    type: event?.event?.type || event?.type || null,
    status: event?.event?.status || event?.status || null
  }));

  return res.status(200).json({ success: true, received: true });
}
