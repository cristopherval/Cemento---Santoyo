/* Default data — material groups, ids and unit prices taken from the Excel.
   Edit prices here to change app-wide defaults. */
(function (global) {
  const MATERIAL_GROUPS = [
    {
      id: 'varilla',
      items: [
        { id: 'varilla_3', price: 4.25 },
        { id: 'varilla_4', price: 6.00 },
        { id: 'varilla_5', price: 11.00 },
        { id: 'varilla_fundacion', price: 9.00 }
      ]
    },
    {
      id: 'concreto',
      items: [
        { id: 'concreto_3000', price: 190.00 },
        { id: 'psi_concreto', price: 170.00 },
        { id: 'pumping_master', price: 1500.00 },
        { id: 'footing', price: 165.00 }
      ]
    },
    {
      id: 'maquinaria',
      items: [
        { id: 'mini_excavadora', price: 300.00 },
        { id: 'pulidora', price: 100.00 },
        { id: 'bobcat', price: 400.00 },
        { id: 'concrete_buggy', price: 250.00 }
      ]
    },
    {
      id: 'personal',
      items: [
        { id: 'labor', price: 250.00 },
        { id: 'master_finisher', price: 350.00 }
      ]
    },
    {
      id: 'madera',
      items: [
        { id: 'wood_2x4', price: 6.00 },
        { id: 'wood_2x6', price: 6.25 },
        { id: 'wood_1x4_yellow', price: 5.00 },
        { id: 'wood_1x4_3d', price: 6.00 }
      ]
    },
    {
      id: 'otros',
      items: [
        { id: 'poly_vapor', price: 85.00 },
        { id: 'diesel', price: 3.20 }
      ]
    }
  ];

  const COMPANY = {
    name: "SANTOYO'S CONCRETE WORK",
    ceo: 'SANTOS SANTOYO',
    phone: '281 - 622 - 3163',
    email: 'sales@santoyosconcrete.com',
    facebook: '@workconcrete',
    website: 'www.santoyosconcrete.com',
    address: '44 June Ln Shepherd, TX 77371'
  };

  const INVOICE_NOTES = [
    'The guarantee for cracks is 1/2"',
    'On the day work begins, half of the total amount is required as a down payment, the rest of the payment will be given once it is finished.'
  ];

  global.AppData = { MATERIAL_GROUPS, COMPANY, INVOICE_NOTES };
})(window);
