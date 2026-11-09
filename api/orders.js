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

    // Filtrar assinatura
    const subscriptionOrders = allOrders.filter(order => {
      if (order.is_subscription !== true) {
        return false;
      }
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

    // Café principal
    const cafeCounts = {};
    subscriptionOrders.slice(0, 30).forEach(order => {
      order.products.forEach(p => {
        if (p.name && !p.name.toLowerCase().includes('kit degustação')) {
          cafeCounts[p.name] = (cafeCounts[p.name] || 0) + 1;
        }
      });
    });

    const mainCafeName = Object.keys(cafeCounts).reduce((a, b) => 
      cafeCounts[a] > cafeCounts[b] ? a : b
    );

    const mainOrders = subscriptionOrders.filter(order =>
      order.products.some(p => p.name === mainCafeName)
    );

    // REMOVER DUPLICATAS por dia
    const uniqueByDay = {};
    mainOrders.forEach(order => {
      const date = order.created_at.split('T')[0];
      if (!uniqueByDay[date] || new Date(order.created_at) > new Date(uniqueByDay[date].created_at)) {
        uniqueByDay[date] = order;
      }
    });

    const sortedOrders = Object.values(uniqueByDay).sort((a, b) => 
      new Date(b.created_at) - new Date(a.created_at)
    );

    const lastOrder = sortedOrders[0];

    let subscriptionProduct = null;
    for (let i = 0; i < lastOrder.products.length; i++) {
      const p = lastOrder.products[i];
      if (p.name === mainCafeName) {
        subscriptionProduct = p;
        break;
      }
    }

    let nextOrderDate = calculateNextOrderDate(lastOrder);

    // Status de pagamento CORRETO
    let paymentStatus = 'Pago';
    let paymentMessage = 'Pagamento em dia';
    
    if (lastOrder.payment_status === 'voided' || lastOrder.payment_status === 'cancelled' || lastOrder.payment_status === 'refunded') {
      paymentStatus = 'Recusado';
      paymentMessage = 'Pagamento recusado';
    } else if (lastOrder.payment_status !== 'paid') {
      paymentStatus = 'Pendente';
      paymentMessage = 'Aguardando confirmação';
    }

    const data = {
      lastOrder: {
        status: lastOrder.payment_status === 'paid' ? 'Feito' : 'Recusado',
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
        status: paymentStatus,
        message: paymentMessage,
        nextDate: nextOrderDate,
        amount: String(lastOrder.total || '80.00'),
        method: lastOrder.payment_details && lastOrder.payment_details.method === 'pix' ? 'Pix' : 'Cartão de Crédito'
      },
      
      currentCoffee: {
        name: subscriptionProduct ? subscriptionProduct.name : 'Café Premium',
        details: subscriptionProduct && subscriptionProduct.variant_values && subscriptionProduct.variant_values[0] ? subscriptionProduct.variant_values[0] : 'Grão inteiro',
        frequency: 20
      },
      
      orderHistory: sortedOrders.slice(1, 6).map(order => {
        let product = null;
        for (let i = 0; i < order.products.length; i++) {
          const p = order.products[i];
          if (p.name === mainCafeName) {
            product = p;
            break;
          }
        }
        
        // Mostrar "Feito" para histórico anterior
        const status = order.payment_status === 'paid' ? 'Feito' : 'Recusado';
        
        return {
          status: status,
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
