# Dependências para geração de gráficos em relatórios

Para habilitar a renderização de gráficos nos relatórios de finanças foram adicionadas as seguintes bibliotecas ao projeto:

- [`chart.js` ^4.5.0](https://www.npmjs.com/package/chart.js): motor de gráficos utilizado para definir datasets, estilos modernos e interações de tooltips.
- [`chartjs-node-canvas` ^5.0.0](https://www.npmjs.com/package/chartjs-node-canvas): camada server-side que renderiza gráficos Chart.js em buffers PNG utilizando Node.js.

## Requisitos de sistema

A biblioteca `chartjs-node-canvas` depende do pacote [`canvas`](https://www.npmjs.com/package/canvas), que por sua vez necessita de bibliotecas nativas. Em distribuições Debian/Ubuntu, instale os pacotes abaixo antes de executar `npm install` em ambientes novos:

```bash
sudo apt-get update && sudo apt-get install -y \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev
```

## Procedimento de instalação

Após garantir os requisitos do sistema, execute:

```bash
npm install
```

Isso instalará todas as dependências, incluindo as novas bibliotecas de geração de gráficos.
