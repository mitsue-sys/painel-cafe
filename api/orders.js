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
      throw new Error(`API Error: ${ordersResponse.statusText}`);
    }

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

    // Filtrar: assinatura + pagamento pago + ignora Kit Degustação
    const subscriptionOrders = allOrders.filter(order => {
      if (order.is_subscription !== true || order.payment_status !== 'paid') {
        return false;
      }
      // Ignora pedidos que são APENAS Kit Degustação
      const hasRealProduct = order.products && order.products.some(p => 
        p.name && !p.name.toLowerCase().includes('kit degustação')
      );
      return hasRealProduct;
    });

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

    // Ordenar por data DESC (mais recente primeiro)
    const sortedOrders = subscriptionOrders.sort((a, b) => 
      new Date(b.created_at) - new Date(a.created_at)
    );

    const lastOrder = sortedOrders[0];

    // Pegar o produto principal (ignora Kit Degustação)
    let subscriptionProduct = null;
    for (let i = 0; i < lastOrder.products.length; i++) {
      const p = lastOrder.products[i];
      if (p.name && !p.name.toLowerCase().includes('kit degustação')) {
        subscriptionProduct = p;
        break;
      }
    }

    let nextOrderDate = calculateNextOrderDate(lastOrder);

    const data = {
      lastOrder: {
        status: lastOrder.fulfillment_status && lastOrder.fulfillment_status.trim() !== '' ? 'Entregue' : 'Processando',
        date: lastOrder.created_at ? lastOrder.created_at.split('T')[0] : '—',
        name: subscriptionProduct ? subscriptionProduct.name : 'Café Premium',
        details: subscriptionProduct ? `${subscriptionProduct.quantity}x | ${subscriptionProduct.variant_values && subscriptionProduct.variant_values[0] ? subscriptionProduct.variant_values[0] : 'Grão inteiro'}` : '—',
        id: lastOrder.id,
        total: String(lastOrder.total || '80.00'),
        image: subscriptionProduct && subscriptionProduct.image ? subscriptionProduct.image.src : null
      },
      
      nextOrder: {
        date: nextOrderDate
      },
      
      paymentStatus: {
        status: lastOrder.payment_status === 'paid' ? 'Pago' : 'Recusado',
        message: lastOrder.payment_status === 'paid' ? 'Pagamento em dia' : 'Pagamento pendente',
        nextDate: nextOrderDate,
        amount: String(lastOrder.total || '80.00'),
        method: lastOrder.payment_details && lastOrder.payment_details.method === 'pix' ? 'Pix' : 'Cartão de Crédito'
      },
      
      currentCoffee: {
        name: subscriptionProduct ? subscriptionProduct.name : 'Café Premium',
        details: subscriptionProduct && subscriptionProduct.variant_values && subscriptionProduct.variant_values[0] ? subscriptionProduct.variant_values[0] : 'Grão inteiro',
        frequency: 20
      },
      
      orderHistory: sortedOrders.slice(0, 5).map(order => {
        let product = null;
        for (let i = 0; i < order.products.length; i++) {
          const p = order.products[i];
          if (p.name && !p.name.toLowerCase().includes('kit degustação')) {
            product = p;
            break;
          }
        }
        
        return {
          status: order.fulfillment_status && order.fulfillment_status.trim() !== '' ? 'Entregue' : 'Processando',
          date: order.created_at ? order.created_at.split('T')[0] : '—',
          name: product ? product.name : 'Café',
          image: product && product.image ? product.image.src : null
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

function calculateNextOrderDate(lastOrder) {
  if (!lastOrder || !lastOrder.created_at) return '—';
  
  const lastDate = new Date(lastOrder.created_at);
  const nextDate = new Date(lastDate);
  nextDate.setDate(nextDate.getDate() + 20);
  
  return formatDate(nextDate.toISOString());
}

function formatDate(dateString) {
  if (!dateString) return '—';
  const date = new Date(dateString);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}
