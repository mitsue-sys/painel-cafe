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

    // Retornar dados de exemplo por enquanto
    const data = {
      lastOrder: {
        status: 'Entregue',
        date: '2026-10-28',
        name: 'Espresso Premium - Etiópia',
        details: '500g | Grão inteiro',
        id: '24456',
        total: '89,90'
      },
      nextOrder: {
        date: '04/11/2026'
      },
      paymentStatus: {
        status: 'Pago',
        message: 'Pagamento em dia',
        nextDate: '04/11/2026',
        amount: '89,90',
        method: 'Cartão •• 4242'
      },
      currentCoffee: {
        name: 'Espresso Premium',
        details: 'Etiópia • Grão inteiro',
        frequency: 20
      },
      orderHistory: [
        { status: 'Entregue', date: '2026-10-28' },
        { status: 'Entregue', date: '2026-10-14' },
        { status: 'Entregue', date: '2026-09-30' }
      ]
    };

    return res.status(200).json(data);

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}
