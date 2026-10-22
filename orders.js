// api/orders.js - Backend serverless para Nuvemshop

const NUVEMSHOP_API = 'https://api.nuvemshop.com.br/v1';
const ACCESS_TOKEN = '187001dcf96b5132fe5983c2850511255ec03d75';

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token,X-Requested-With,Accept,Accept-Version,Content-Length,Content-MD5,Content-Type,Date,X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const { customerId } = req.query;

    if (!customerId) {
      return res.status(400).json({ error: 'customerId é obrigatório' });
    }

    // Buscar pedidos do cliente
    const ordersResponse = await fetch(
      `${NUVEMSHOP_API}/orders?customer=${customerId}`,
      {
        headers: {
          'Authorization': `Bearer ${ACCESS_TOKEN}`,
          'Accept': 'application/json'
        }
      }
    );

    if (!ordersResponse.ok) {
      throw new Error(`Erro na API: ${ordersResponse.statusText}`);
    }

    const ordersData = await ordersResponse.json();
    const orders = ordersData.orders || [];

    // Ordenar por data (mais recente primeiro)
    orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // Formatar resposta
    const lastOrder = orders[0];
    const nextOrder = orders[0]; // Placeholder - será calculado com base na recorrência
    const paymentStatus = lastOrder ? lastOrder.payment_status : 'Pago';

    const response = {
      lastOrder: lastOrder ? {
        status: 'Entregue',
        date: lastOrder.created_at?.split('T')[0],
        name: lastOrder.fulfillment_status === 'unshipped' ? 'Pendente' : 'Entregue',
        details: lastOrder.line_items?.map(item => `${item.product_title} (${item.quantity}x)`).join(', ') || 'Café Premium',
        id: lastOrder.id,
        total: lastOrder.total
      } : null,

      nextOrder: {
        date: calculateNextOrderDate(lastOrder)
      },

      paymentStatus: {
        status: paymentStatus === 'paid' ? 'Pago' : 'Recusado',
        message: paymentStatus === 'paid' ? 'Pagamento em dia' : 'Pagamento pendente',
        nextDate: calculateNextOrderDate(lastOrder),
        amount: lastOrder?.total || '89,90',
        method: 'Cartão •• 4242'
      },

      currentCoffee: {
        name: lastOrder?.line_items?.[0]?.product_title || 'Espresso Premium',
        details: 'Café selecionado • Grão inteiro',
        frequency: 20
      },

      orderHistory: orders.slice(0, 3).map(order => ({
        status: 'Entregue',
        date: order.created_at?.split('T')[0]
      }))
    };

    return res.status(200).json(response);

  } catch (error) {
    console.error('Erro:', error);
    return res.status(500).json({
      error: 'Erro ao buscar dados',
      message: error.message
    });
  }
}

function calculateNextOrderDate(lastOrder) {
  if (!lastOrder) return '2026-06-04';

  const lastDate = new Date(lastOrder.created_at);
  const nextDate = new Date(lastDate);
  nextDate.setDate(nextDate.getDate() + 20); // 20 dias de frequência

  return nextDate.toISOString().split('T')[0];
}