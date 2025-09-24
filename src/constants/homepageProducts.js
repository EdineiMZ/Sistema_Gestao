const currencyFormatter = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2
});

const formatCurrency = (value) => {
    if (typeof value !== 'number' || Number.isNaN(value)) {
        return value;
    }

    return currencyFormatter.format(value);
};

const enrichProduct = (product) => {
    const {
        price,
        originalPrice,
        installments,
        rating,
        reviews,
        availability,
        shipping,
        badge,
        accent,
        category,
        categoryLabel,
        ...rest
    } = product;

    const normalizedPrice = typeof price === 'number' ? price : parseFloat(String(price).replace(/[^0-9.,-]/g, '').replace(',', '.'));
    const normalizedOriginal = typeof originalPrice === 'number'
        ? originalPrice
        : originalPrice
            ? parseFloat(String(originalPrice).replace(/[^0-9.,-]/g, '').replace(',', '.'))
            : null;

    return {
        id: rest.id,
        name: rest.name,
        description: rest.description,
        features: Array.isArray(rest.features) ? rest.features : [],
        tag: rest.tag || badge || null,
        accent: accent || rest.accent || 'primary',
        category: category || null,
        categoryLabel: categoryLabel || rest.categoryLabel || category || null,
        deliveryEstimate: rest.deliveryEstimate || null,
        loyaltyInfo: rest.loyaltyInfo || null,
        price: normalizedPrice,
        originalPrice: normalizedOriginal,
        priceLabel: typeof normalizedPrice === 'number' && !Number.isNaN(normalizedPrice)
            ? formatCurrency(normalizedPrice)
            : price,
        originalPriceLabel:
            typeof normalizedOriginal === 'number' && !Number.isNaN(normalizedOriginal)
                ? formatCurrency(normalizedOriginal)
                : null,
        installmentLabel:
            typeof installments === 'string' && installments.trim().length
                ? installments
                : typeof normalizedPrice === 'number' && !Number.isNaN(normalizedPrice)
                    ? `Em até 10x de ${formatCurrency(normalizedPrice / 10)} sem juros`
                    : null,
        rating: typeof rating === 'number' ? rating : 4.8,
        reviews: typeof reviews === 'number' ? reviews : 120,
        availability: availability || 'Pronta entrega',
        shipping: shipping || 'Entrega rápida para capitais'
    };
};

const featuredBase = [
    {
        id: 'combo-setup-elite',
        name: 'Combo Setup Elite Gamer',
        description: 'Desktop com GeForce RTX 4070 Ti SUPER, Ryzen 7 7800X3D e 32GB DDR5 RGB para máxima performance.',
        features: [
            'Water cooler de 360mm com controle ARGB',
            'SSD NVMe 1TB PCIe 4.0 de alta velocidade',
            'Garantia premium de 3 anos Kabum Pro'
        ],
        tag: 'LANÇAMENTO',
        accent: 'magenta',
        price: 4599.9,
        originalPrice: 5299.9,
        installments: '10x de R$ 459,99 sem juros',
        rating: 4.9,
        reviews: 318,
        shipping: 'Frete Turbo para capitais selecionadas',
        availability: 'Estoque limitado',
        category: 'hardware',
        categoryLabel: 'Hardware Gamer',
        deliveryEstimate: 'Receba em até 2 dias úteis'
    },
    {
        id: 'monitor-oled-45',
        name: 'Monitor OLED 45" UltraWide 240Hz',
        description: 'Painel OLED curvo com 240Hz, tempo de resposta de 0.03ms e cobertura DCI-P3 98%.',
        features: [
            'Tecnologia HDR10 com pico de 1000 nits',
            'Hub USB-C com 90W de Power Delivery',
            'Modo Creator calibrado de fábrica'
        ],
        tag: 'FRETE GRÁTIS',
        accent: 'cyan',
        price: 6899.9,
        originalPrice: 7599.9,
        rating: 4.8,
        reviews: 204,
        shipping: 'Frete grátis para todo Brasil',
        availability: 'Pronta entrega',
        category: 'monitores',
        categoryLabel: 'Monitores OLED',
        deliveryEstimate: 'Entrega em 3 dias úteis'
    },
    {
        id: 'cadeira-premium-carbon',
        name: 'Cadeira Ergonômica Carbon Pro',
        description: 'Ajustes 4D, malha inteligente e suporte lombar ativo com sensor de pressão.',
        features: [
            'Estrutura em alumínio aeronáutico',
            'Revestimento com fibra de carbono sintética',
            'Peso suportado até 180kg'
        ],
        tag: 'EXCLUSIVO',
        accent: 'orange',
        price: 2299.9,
        rating: 4.7,
        reviews: 97,
        shipping: 'Envio imediato',
        availability: 'Últimas unidades',
        category: 'perifericos',
        categoryLabel: 'Periféricos Pro',
        deliveryEstimate: 'Receba em até 4 dias úteis'
    }
];

const promotionBase = [
    {
        id: 'ssd-2tb-gen4',
        name: 'SSD NVMe 2TB PCIe 4.0 7400MB/s',
        description: 'Armazenamento ultra veloz com dissipador integrado e tecnologia Dynamic Cache.',
        tag: '-32%',
        accent: 'orange',
        price: 899.9,
        originalPrice: 1329.9,
        rating: 4.9,
        reviews: 412,
        shipping: 'Frete turbo disponível',
        availability: 'Pronta entrega',
        category: 'armazenamento',
        categoryLabel: 'Armazenamento'
    },
    {
        id: 'fonte-850w-platinum',
        name: 'Fonte Modular 850W 80 Plus Platinum',
        description: 'Totalmente modular, cabos sleeve premium e 10 anos de garantia.',
        tag: 'CASHBACK',
        accent: 'cyan',
        price: 1099.9,
        originalPrice: 1399.9,
        rating: 4.8,
        reviews: 268,
        shipping: 'Entrega expressa',
        availability: 'Estoque disponível',
        category: 'hardware',
        categoryLabel: 'Hardware Gamer',
        loyaltyInfo: 'R$ 80 de volta no Kabum+ '
    },
    {
        id: 'headset-7-1',
        name: 'Headset Gamer Surround 7.1 Carbon',
        description: 'Drivers de 50mm, cancelamento ativo de ruído e software com equalização avançada.',
        tag: '-40%',
        accent: 'magenta',
        price: 499.9,
        originalPrice: 829.9,
        rating: 4.7,
        reviews: 521,
        shipping: 'Retire hoje nas lojas parceiras',
        availability: 'Disponível',
        category: 'audio',
        categoryLabel: 'Áudio Gamer'
    },
    {
        id: 'kit-streaming-4k',
        name: 'Kit Streaming 4K Creator',
        description: 'Webcam 4K HDR, placa de captura com baixa latência e iluminação key light.',
        tag: 'OFERTA DO DIA',
        accent: 'purple',
        price: 2499.9,
        originalPrice: 3129.9,
        rating: 4.8,
        reviews: 143,
        shipping: 'Entrega programada',
        availability: 'Estoque limitado',
        category: 'criacao',
        categoryLabel: 'Conteúdo & Streaming'
    },
    {
        id: 'notebook-creator-rtx4060',
        name: 'Notebook Creator 16" RTX 4060',
        description: 'Intel Core i9 14ª gen, 32GB DDR5 e tela Mini LED calibrada para design.',
        tag: 'R$ 700 OFF',
        accent: 'blue',
        price: 9799.9,
        originalPrice: 10499.9,
        rating: 4.9,
        reviews: 87,
        shipping: 'Frete grátis Brasil',
        availability: 'Pré-venda confirmada',
        category: 'notebooks',
        categoryLabel: 'Notebooks Premium'
    }
];

const recommendedBase = [
    {
        id: 'mouse-ultralight',
        name: 'Mouse Ultralight 59g Wireless',
        description: 'Sensor 8K, switches ópticos e autonomia de 120 horas.',
        tag: 'MATCH IDEAL',
        accent: 'cyan',
        price: 399.9,
        originalPrice: 529.9,
        rating: 4.9,
        reviews: 612,
        shipping: 'Entrega em 24h para São Paulo',
        availability: 'Pronta entrega',
        category: 'perifericos',
        categoryLabel: 'Periféricos Pro',
        features: ['Switches ópticos com 100M cliques', 'Grip texturizado e skates PTFE', 'Conexão tri-mode (USB, 2.4G, BT)']
    },
    {
        id: 'teclado-low-profile',
        name: 'Teclado Mecânico Low Profile RGB',
        description: 'Layout ABNT2, switches hot-swap e espuma acústica premium.',
        tag: 'TENDÊNCIA',
        accent: 'magenta',
        price: 649.9,
        originalPrice: 799.9,
        rating: 4.8,
        reviews: 341,
        shipping: 'Frete turbo disponível',
        availability: 'Estoque disponível',
        category: 'perifericos',
        categoryLabel: 'Periféricos Pro',
        features: ['Keycaps PBT double-shot', 'Software com macros ilimitadas', 'Modo sem fio de baixa latência']
    },
    {
        id: 'smart-hub-wifi6e',
        name: 'Roteador Wi-Fi 6E Mesh 5400Mbps',
        description: 'Mesh inteligente com canais de 6GHz, segurança WPA3 e app intuitivo.',
        tag: 'BASEADO NA SUA BUSCA',
        accent: 'orange',
        price: 1299.9,
        originalPrice: 1599.9,
        rating: 4.7,
        reviews: 189,
        shipping: 'Envio imediato',
        availability: 'Estoque disponível',
        category: 'redes',
        categoryLabel: 'Redes & Conectividade',
        features: ['Cobertura para até 260m²', 'Portas 2.5GbE agregáveis', 'Proteção IoT com firewall embutido']
    },
    {
        id: 'cadeira-gamer-x',
        name: 'Cadeira Gamer X Comfort',
        description: 'Espuma injetada, reclinação 180° e apoio cervical magnético.',
        tag: 'VOCÊ VIU RECENTEMENTE',
        accent: 'blue',
        price: 1199.9,
        originalPrice: 1549.9,
        rating: 4.6,
        reviews: 215,
        shipping: 'Frete grátis Sul e Sudeste',
        availability: 'Estoque limitado',
        category: 'perifericos',
        categoryLabel: 'Periféricos Pro',
        features: ['Ajustes 4D nos apoios', 'Estrutura reforçada em aço', 'Garantia de 2 anos Kabum']
    }
];

const catalogExtraBase = [
    {
        id: 'watercooler-360',
        name: 'Water Cooler 360mm Infinity Mirror',
        description: 'Bomba de 8ª geração com baixo ruído e controle por software.',
        tag: 'MAIS VENDIDO',
        accent: 'blue',
        price: 899.9,
        rating: 4.9,
        reviews: 564,
        shipping: 'Frete turbo disponível',
        availability: 'Pronta entrega',
        category: 'hardware',
        categoryLabel: 'Hardware Gamer'
    },
    {
        id: 'placa-mae-x670e',
        name: 'Placa-mãe X670E Wi-Fi 6E',
        description: 'PCIe 5.0, DDR5 e BIOS flashback para processadores Ryzen 8000.',
        tag: 'TOP TIER',
        accent: 'magenta',
        price: 2699.9,
        originalPrice: 2999.9,
        rating: 4.8,
        reviews: 231,
        shipping: 'Entrega expressa',
        availability: 'Estoque disponível',
        category: 'hardware',
        categoryLabel: 'Hardware Gamer'
    },
    {
        id: 'kit-upgrade-intel',
        name: 'Kit Upgrade Intel Core i7 14700K',
        description: 'Processador 20 cores + placa-mãe Z790 DDR5 + 32GB 6000MHz.',
        tag: 'KIT PERFORMANCE',
        accent: 'orange',
        price: 5299.9,
        rating: 4.9,
        reviews: 154,
        shipping: 'Frete grátis Brasil',
        availability: 'Pronta entrega',
        category: 'hardware',
        categoryLabel: 'Hardware Gamer'
    },
    {
        id: 'monitor-240hz',
        name: 'Monitor 27" IPS 240Hz Fast',
        description: 'Tempo de resposta 1ms, G-Sync compatible e design borderless.',
        tag: 'GAMERS',
        accent: 'cyan',
        price: 1999.9,
        originalPrice: 2299.9,
        rating: 4.8,
        reviews: 301,
        shipping: 'Entrega em até 3 dias',
        availability: 'Pronta entrega',
        category: 'monitores',
        categoryLabel: 'Monitores'
    },
    {
        id: 'kit-smart-home',
        name: 'Kit Smart Home Segurança 6 Peças',
        description: 'Câmeras 2K, sensores de movimento e automação por aplicativo.',
        tag: 'CASA INTELIGENTE',
        accent: 'purple',
        price: 1599.9,
        originalPrice: 1899.9,
        rating: 4.6,
        reviews: 188,
        shipping: 'Entrega programada',
        availability: 'Estoque disponível',
        category: 'smart',
        categoryLabel: 'Casa Inteligente'
    },
    {
        id: 'cadeira-executiva-ergonomica',
        name: 'Cadeira Executiva Ergonômica Mesh',
        description: 'Apoio lombar dinâmico, ajuste de reclinação síncrona e certificação BIFMA.',
        tag: 'CONFORTO PRO',
        accent: 'blue',
        price: 1799.9,
        rating: 4.7,
        reviews: 142,
        shipping: 'Retire hoje nas lojas parceiras',
        availability: 'Pronta entrega',
        category: 'perifericos',
        categoryLabel: 'Escritório Premium'
    },
    {
        id: 'impressora-laser-pro',
        name: 'Impressora Laser Pro Wi-Fi',
        description: 'Duplex automático, toner rendimento 8.000 páginas e app mobile seguro.',
        tag: 'CORPORATIVO',
        accent: 'orange',
        price: 2149.9,
        originalPrice: 2399.9,
        rating: 4.5,
        reviews: 98,
        shipping: 'Entrega programada',
        availability: 'Pronta entrega',
        category: 'corporativo',
        categoryLabel: 'Corporativo'
    },
    {
        id: 'gpu-rtx4090',
        name: 'GeForce RTX 4090 24GB OC',
        description: 'Tri-Fan, vapor chamber e dual BIOS silenciosa para criadores exigentes.',
        tag: 'ULTIMATE',
        accent: 'magenta',
        price: 13999.9,
        rating: 5.0,
        reviews: 76,
        shipping: 'Frete blindado Kabum',
        availability: 'Estoque limitado',
        category: 'hardware',
        categoryLabel: 'Hardware Enthusiast'
    }
];

const featuredProducts = featuredBase.map(enrichProduct);
const promotionProducts = promotionBase.map(enrichProduct);
const recommendedProducts = recommendedBase.map(enrichProduct);
const catalogExtraProducts = catalogExtraBase.map(enrichProduct);

const catalogProducts = Array.from(
    new Map(
        [...featuredProducts, ...promotionProducts, ...recommendedProducts, ...catalogExtraProducts].map((product) => [
            product.id,
            product
        ])
    ).values()
);

module.exports = {
    featuredProducts,
    promotionProducts,
    recommendedProducts,
    catalogProducts
};
