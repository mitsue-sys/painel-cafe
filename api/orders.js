export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { customerId } = req.query;
    console.log('📥 API recebeu customerId:', customerId);

    if (!customerId) {
      console.error('❌ customerId não fornecido');
      return res.status(400).json({ error: 'customerId is required' });
    }

    const NUVEMSHOP_API = 'https://api.nuvemshop.com.br/v1/6800777';
    const TOKEN = '20176ee30509eb5bad4eed29e01ec96eb4dfa350';

    // Buscar TODOS os pedidos (filtro ?customer= não funciona)
    const url = `${NUVEMSHOP_API}/orders?per_page=100`;
    console.log(`🌐 Chamando: ${url}`);

    const ordersResponse = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Accept': 'application/json',
        'User-Agent': 'CafePorelasIntegration/1.0'
      }
    });

    console.log(`📊 HTTP Status: ${ordersResponse.status}`);

    if (!ordersResponse.ok) {
      const errorText = await ordersResponse.text();
      console.error(`❌ Erro HTTP ${ordersResponse.status}: ${errorText}`);
      throw new Error(`API Error: ${ordersResponse.status} ${ordersResponse.statusText}`);
    }

    let allOrders = await ordersResponse.json();
    console.log(`📊 Total de pedidos brutos da loja: ${allOrders.length}`);

    // DEBUG: Mostrar estrutura do primeiro pedido
    if (allOrders.length > 0) {
      console.log('🔍 Estrutura do primeiro pedido:', JSON.stringify(allOrders[0], null, 2));
      console.log('🔍 Customer do primeiro pedido:', allOrders[0].customer);
    }

    // FILTRAR PELO CLIENTE CORRETO (no código, não na API)
    // Tenta diferentes variáveis possíveis
    let customerField = null;
    if (allOrders.length > 0) {
      const firstOrder = allOrders[0];
      if (firstOrder.customer?.id) customerField = 'customer.id';
      else if (firstOrder.customer_id) customerField = 'customer_id';
      else if (firstOrder.customerId) customerField = 'customerId';
      else if (firstOrder.customer?.number) customerField = 'customer.number';
    }
    console.log(`🔑 Campo identificado: ${customerField}`);

    // Debug: mostrar o customer_id de vários pedidos
    console.log('📋 customer_id dos primeiros 5 pedidos:');
    for (let i = 0; i < Math.min(5, allOrders.length); i++) {
      console.log(`  Pedido ${i}: customer_id=${allOrders[i].customer_id}, customer.id=${allOrders[i].customer?.id}`);
    }

    allOrders = allOrders.filter(order => {
      // Tentar customer_id primeiro (sem ponto)
      let orderId = order.customer_id || order.customer?.id || order.customerId || order.customer?.number;
      return String(orderId) === String(customerId);
    });
    console.log(`🎯 Pedidos do cliente ${customerId}: ${allOrders.length}`);

    if (!Array.isArray(allOrders) || allOrders.length === 0) {
      console.log(`⚠️ Cliente ${customerId} não tem pedidos`);
      return res.status(200).json({
        error: 'Nenhum pedido encontrado',
        lastOrder: null,
        nextOrder: { date: '—' },
        paymentStatus: { status: 'N/A', message: 'Sem assinatura', nextDate: '—', amount: '—', method: '—' },
        currentCoffee: { name: 'N/A', details: 'Sem assinatura ativa', frequency: 20 },
        orderHistory: []
      });
    }

    // FILTRAR apenas PEDIDOS DE ASSINATURA
    const subscriptionOrders = allOrders.filter(order => order.is_subscription === true);
    console.log(`✅ Pedidos de assinatura do cliente: ${subscriptionOrders.length}`);

    if (subscriptionOrders.length === 0) {
      console.log(`❌ Cliente ${customerId} não tem assinatura ativa`);
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
    const sortedOrders = subscriptionOrders.sort((a, b) =>
      new Date(b.created_at) - new Date(a.created_at)
    );

    const lastOrder = sortedOrders[0];
    console.log(`📦 Último pedido de assinatura: ID=${lastOrder.id}, data=${lastOrder.created_at}`);

    // Extrair produto de assinatura
    const subscriptionProduct = lastOrder.products.find(p =>
      p.name && !p.name.toLowerCase().includes('kit degustação')
    ) || lastOrder.products[0];

    let nextOrderDate = calculateNextOrderDate(lastOrder);

    // Formatar resposta
    const data = {
      lastOrder: {
        status: lastOrder.fulfillment_status === 'fulfilled' ? 'Entregue' : 'Processando',
        date: lastOrder.created_at?.split('T')[0] || '—',
        name: subscriptionProduct?.name || 'Café Premium',
        details: `${subscriptionProduct?.quantity || 1}x | ${subscriptionProduct?.variant_values?.[0] || 'Grão inteiro'}`,
        id: lastOrder.id,
        total: String(lastOrder.total || '80.00'),
        image: subscriptionProduct?.image?.src || null
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
          status: order.fulfillment_status === 'fulfilled' ? 'Entregue' : 'Processando',
          date: order.created_at?.split('T')[0],
          name: product?.name,
          image: product?.image?.src || null
        };
      })
    };

    console.log('✅ Resposta preparada com sucesso');
    return res.status(200).json(data);

  } catch (error) {
    console.error('❌ Erro geral:', error.message);
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
