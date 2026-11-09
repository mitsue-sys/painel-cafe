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
      `${NUVEMSHOP_API}/orders?customer=${customerId}&per_page=100`,
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

    // A API retorna um array diretamente
    const allOrders = await ordersResponse.json();

    if (!Array.isArray(allOrders) || allOrders.length === 0) {
      return res.status(200).json({
        error: 'Nenhum pedido encontrado',
        lastOrder: null,
        nextOrder: { date: '—' },
        paymentStatus: { status: 'N/A', message: 'Sem assinatura', nextDate: '—', amount: '—', method: '—' },
        currentCoffee: { name: 'N/A', details: 'Sem assinatura ativa', frequency: 20 },
        orderHistory: []
      });
    }

    // Filtrar apenas pedidos de assinatura
    const subscriptionOrders = allOrders.filter(order => order.is_subscription === true);

    if (subscriptionOrders.length === 0) {
      return res.status(200).json({
        error: 'Nenhuma assinatura ativa',
        lastOrder: null,
        nextOrder: { date: '—' },
        paymentStatus: { status: 'N/A', message: 'Sem assinatura ativa', nextDate: '—', amount: '—', method: '—' },
        currentCoffee: { name: 'N/A', details: 'Sem assinatura ativa', frequency: 20 },
        orderHistory: []
      });
    }

    // Ordenar por data (mais recente primeiro)
    const sortedOrders = [...subscriptionOrders].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const lastOrder = sortedOrders[0];

    // Extrair produto de assinatura (ignora Kit Degustação)
    const subscriptionProduct = lastOrder.products.find(p => 
      p.name && !p.name.toLowerCase().includes('kit degustação')
    ) || lastOrder.products[0];

    let nextOrderDate = calculateNextOrderDate(lastOrder);

    // Tentar buscar data exata de próxima assinatura
    if (lastOrder?.id) {
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
          if (Array.isArray(subscData) && subscData.length > 0 && subscData[0].next_execution) {
            nextOrderDate = formatDate(subscData[0].next_execution);
          }
        }
      } catch (e) {
        console.log('Subscription fetch skipped:', e.message);
      }
    }

    // Formatar resposta
    const data = {
      lastOrder: {
        status: lastOrder.fulfillment_status === 'fulfilled' ? 'Entregue' : 'Pendente',
        date: lastOrder.created_at?.split('T')[0] || '—',
        name: subscriptionProduct?.name || 'Café Premium',
        details: `${subscriptionProduct?.quantity || 1}x | ${subscriptionProduct?.variant_values?.[0] || 'Grão inteiro'}`,
        id: lastOrder.id,
        total: String(lastOrder.total || '80.00')
      },
      
      nextOrder: {
        date: nextOrderDate
      },
      
      paymentStatus: {
        status: lastOrder.payment_status === 'paid' ? 'Pago' : 'Recusado',
        message: lastOrder.payment_status === 'paid' ? 'Pagamento em dia' : 'Pagamento pendente',
        nextDate: nextOrderDate,
        amount: String(lastOrder.total || '80.00'),
        method: lastOrder.payment_details?.method === 'pix' ? 'Pix' : 'Cartão de Crédito'
      },
      
      currentCoffee: {
        name: subscriptionProduct?.name || 'Café Premium',
        details: subscriptionProduct?.variant_values?.[0] || 'Grão inteiro',
        frequency: 20
      },
      
      orderHistory: sortedOrders.slice(0, 5).map(order => {
        const product = order.products.find(p => 
          p.name && !p.name.toLowerCase().includes('kit degustação')
        ) || order.products[0];
        return {
          status: order.fulfillment_status === 'fulfilled' ? 'Entregue' : 'Pendente',
          date: order.created_at?.split('T')[0],
          name: product?.name
        };
      })
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
