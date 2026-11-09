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

    const NUVEMSHOP_API = 'https://api.nuvemshop.com.br/v1/6800777';
    const TOKEN = '20176ee30509eb5bad4eed29e01ec96eb4dfa350';

    // Buscar pedidos do cliente
    const ordersResponse = await fetch(
      `${NUVEMSHOP_API}/orders?customer=${customerId}&per_page=10`,
      {
        headers: {
          'Authorization': `Bearer ${TOKEN}`,
          'Accept': 'application/json',
          'User-Agent': 'CafePorelasIntegration/1.0'
        }
      }
    );

    if (!ordersResponse.ok) {
      console.error('Nuvemshop API Error:', ordersResponse.status, ordersResponse.statusText);
      throw new Error(`API Error: ${ordersResponse.statusText}`);
    }

    const ordersData = await ordersResponse.json();
    const orders = ordersData.orders || [];

    if (orders.length === 0) {
      return res.status(200).json({
        error: 'Nenhum pedido encontrado',
        lastOrder: null,
        nextOrder: { date: '—' },
        paymentStatus: { status: 'N/A', message: 'Sem pedidos', nextDate: '—', amount: '—', method: '—' },
        currentCoffee: { name: 'N/A', details: 'Sem assinatura', frequency: 20 },
        orderHistory: []
      });
    }

    // Ordenar por data (mais recente primeiro)
    orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const lastOrder = orders[0];

    // Buscar informações de assinatura se disponível
    let nextOrderDate = calculateNextOrderDate(lastOrder);
    if (lastOrder.id) {
      try {
        const subscResponse = await fetch(
          `${NUVEMSHOP_API}/orders/${lastOrder.id}/subscriptions`,
          {
            headers: {
              'Authorization': `Bearer ${TOKEN}`,
              'Accept': 'application/json',
              'User-Agent': 'CafePorelasIntegration/1.0'
            }
          }
        );
        
        if (subscResponse.ok) {
          const subscData = await subscResponse.json();
          const subscription = subscData.subscriptions?.[0];
          if (subscription && subscription.next_execution) {
            nextOrderDate = formatDate(subscription.next_execution);
          }
        }
      } catch (e) {
        console.log('Subscription fetch skipped:', e.message);
      }
    }

    // Formatar resposta
    const data = {
      lastOrder: lastOrder ? {
        status: lastOrder.fulfillment_status === 'fulfilled' ? 'Entregue' : 'Pendente',
        date: lastOrder.created_at?.split('T')[0] || '—',
        name: lastOrder.line_items?.[0]?.product_title || 'Café Premium',
        details: `${lastOrder.line_items?.[0]?.quantity || 1}x | Grão inteiro`,
        id: lastOrder.id,
        total: String(lastOrder.total || '89,90')
      } : null,
      
      nextOrder: {
        date: nextOrderDate
      },
      
      paymentStatus: {
        status: lastOrder?.payment_status === 'paid' ? 'Pago' : 'Recusado',
        message: lastOrder?.payment_status === 'paid' ? 'Pagamento em dia' : 'Pagamento pendente',
        nextDate: nextOrderDate,
        amount: String(lastOrder?.total || '89,90'),
        method: lastOrder?.payment_method?.description || 'Cartão •• 4242'
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

function formatDate(dateString) {
  if (!dateString) return '—';
  const date = new Date(dateString);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function calculateNextOrderDate(lastOrder) {
  if (!lastOrder) return '—';
  
  const lastDate = new Date(lastOrder.created_at);
  const nextDate = new Date(lastDate);
  nextDate.setDate(nextDate.getDate() + 20);
  
  return formatDate(nextDate.toISOString());
}
