export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { customerId } = req.query;
    
    if (!customerId) {
      return res.status(400).json({ error: 'customerId is required' });
    }

    const NUVEMSHOP_API = 'https://api.nuvemshop.com.br/v1';
    const TOKEN = '187001dcf96b5132fe5983c2850511255ec03d75';

    // Buscar pedidos do cliente
    const ordersResponse = await fetch(
      `${NUVEMSHOP_API}/orders?customer=${customerId}`,
      {
        headers: {
          'Authorization': `Bearer ${TOKEN}`,
          'Accept': 'application/json'
        }
      }
    );

    if (!ordersResponse.ok) {
      console.error('Nuvemshop API Error:', ordersResponse.status);
      throw new Error(`Nuvemshop API: ${ordersResponse.statusText}`);
    }

    const ordersData = await ordersResponse.json();
    const orders = ordersData.orders || [];

    // Ordenar por data (mais recente primeiro)
    orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const lastOrder = orders[0];
    const nextOrder = orders[0];

    // Formatar resposta
    const data = {
      lastOrder: lastOrder ? {
        status: lastOrder.fulfillment_status === 'fulfilled' ? 'Entregue' : 'Pendente',
        date: lastOrder.created_at?.split('T')[0] || '—',
        name: lastOrder.line_items?.[0]?.product_title || 'Café Premium',
        details: `${lastOrder.line_items?.[0]?.quantity || 1}x | Grão inteiro`,
        id: lastOrder.id,
        total: lastOrder.total || '89,90'
      } : null,
      
      nextOrder: {
        date: calculateNextOrderDate(lastOrder)
      },
      
      paymentStatus: {
        status: lastOrder?.payment_status === 'paid' ? 'Pago' : 'Recusado',
        message: lastOrder?.payment_status === 'paid' ? 'Pagamento em dia' : 'Pagamento pendente',
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
        status: order.fulfillment_status === 'fulfilled' ? 'Entregue' : 'Pendente',
        date: order.created_at?.split('T')[0]
      }))
    };

    return res.status(200).json(data);

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ 
      error: 'Erro ao carregar dados',
      message: error.message 
    });
  }
}

function calculateNextOrderDate(lastOrder) {
  if (!lastOrder) return '—';
  
  const lastDate = new Date(lastOrder.created_at);
  const nextDate = new Date(lastDate);
  nextDate.setDate(nextDate.getDate() + 20);
  
  const day = String(nextDate.getDate()).padStart(2, '0');
  const month = String(nextDate.getMonth() + 1).padStart(2, '0');
  const year = nextDate.getFullYear();
  
  return `${day}/${month}/${year}`;
}
