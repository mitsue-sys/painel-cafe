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

    // Retornar dados de exemplo
    const data = {
      lastOrder: {
        status: 'Entregue',
        date: '2026-11-08',
        name: 'Espresso Premium - Etiópia',
        details: '1x | Grão inteiro',
        id: '24456',
        total: '89,90'
      },
      nextOrder: {
        date: '28/11/2026'
      },
      paymentStatus: {
        status: 'Pago',
        message: 'Pagamento em dia',
        nextDate: '28/11/2026',
        amount: '89,90',
        method: 'Cartão •• 4242'
      },
      currentCoffee: {
        name: 'Espresso Premium',
        details: 'Café selecionado • Grão inteiro',
        frequency: 20
      },
      orderHistory: [
        { status: 'Entregue', date: '2026-11-08' },
        { status: 'Entregue', date: '2026-10-19' },
        { status: 'Entregue', date: '2026-09-30' }
      ]
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
