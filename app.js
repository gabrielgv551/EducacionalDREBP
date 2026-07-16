const formatCurrency = (v) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);

const formatPercent = (v) => `${v.toFixed(1).replace('.', ',')}%`;

const defaultState = {
  receitaBruta: 5_000_000,
  deducoes: 12,
  cmvPercent: 45,
  despesasFixas: 800_000,
  despesasVariaveis: 12,
  pmr: 45,
  pme: 35,
  pmp: 30,
  depreciacao: 180_000,
  sazonalidade: 1.0,
};

let state = { ...defaultState };
let savedScenario = null;
let selectedTrace = null;
let viewMode = 'annual'; // 'annual' | 'monthly'

const inputs = {};
const displays = {};

const formatCurrencyMonthly = (v) => formatCurrency(v / 12);
const formatPercentView = (v) => formatPercent(v);

const inputDefs = [
  ['receitaBruta', 'valReceitaBruta', () => viewMode === 'monthly' ? formatCurrencyMonthly(state.receitaBruta) : formatCurrency(state.receitaBruta)],
  ['deducoes', 'valDeducoes', () => formatPercentView(state.deducoes)],
  ['cmvPercent', 'valCmvPercent', () => formatPercentView(state.cmvPercent)],
  ['despesasFixas', 'valDespesasFixas', () => viewMode === 'monthly' ? formatCurrencyMonthly(state.despesasFixas) : formatCurrency(state.despesasFixas)],
  ['despesasVariaveis', 'valDespesasVariaveis', () => formatPercentView(state.despesasVariaveis)],
  ['pmr', 'valPmr', (v) => `${v} dias`],
  ['pme', 'valPme', (v) => `${v} dias`],
  ['pmp', 'valPmp', (v) => `${v} dias`],
  ['depreciacao', 'valDepreciacao', () => viewMode === 'monthly' ? formatCurrencyMonthly(state.depreciacao) : formatCurrency(state.depreciacao)],
  ['sazonalidade', 'valSazonalidade', (v) => `${v > 0 ? '+' : ''}${v.toFixed(1).replace('.', ',')}% / mês`],
];

function updateInputDisplays() {
  inputDefs.forEach(([key, displayId, formatter]) => {
    displays[key].textContent = formatter(state[key]);
  });
}

function initViewToggle() {
  const btnAnnual = document.getElementById('btnViewAnnual');
  const btnMonthly = document.getElementById('btnViewMonthly');
  btnAnnual.addEventListener('click', () => {
    viewMode = 'annual';
    btnAnnual.classList.add('active');
    btnMonthly.classList.remove('active');
    updateInputDisplays();
    updateAll();
  });
  btnMonthly.addEventListener('click', () => {
    viewMode = 'monthly';
    btnMonthly.classList.add('active');
    btnAnnual.classList.remove('active');
    updateInputDisplays();
    updateAll();
  });
}

function initInputs() {
  inputDefs.forEach(([key, displayId, formatter]) => {
    const el = document.getElementById(key);
    const disp = document.getElementById(displayId);
    inputs[key] = el;
    displays[key] = disp;
    el.value = state[key];
    disp.textContent = formatter(state[key]);
    el.addEventListener('input', () => {
      state[key] = parseFloat(el.value);
      disp.textContent = formatter(state[key]);
      updateAll();
    });
  });
}

function calculateDRE(s = state) {
  const receitaLiquida = s.receitaBruta * (1 - s.deducoes / 100);
  const cmv = receitaLiquida * (s.cmvPercent / 100);
  const lucroBruto = receitaLiquida - cmv;
  const despesasVariaveis = receitaLiquida * (s.despesasVariaveis / 100);
  const despesasOperacionais = s.despesasFixas + despesasVariaveis;
  const ebitda = lucroBruto - despesasOperacionais;
  const ebit = ebitda - s.depreciacao;
  const resultadoFinanceiro = 0;
  const laIR = ebit - resultadoFinanceiro;
  const ir = Math.max(0, laIR * 0.34);
  const lucroLiquido = laIR - ir;
  return {
    receitaBruta: s.receitaBruta,
    receitaLiquida,
    cmv,
    lucroBruto,
    despesasOperacionais,
    ebitda,
    depreciacao: s.depreciacao,
    ebit,
    resultadoFinanceiro,
    laIR,
    ir,
    lucroLiquido,
  };
}

function calculateDREMonthly(s = state) {
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const baseReceita = s.receitaBruta / 12;
  const baseDespesasFixas = s.despesasFixas / 12;
  const baseDepreciacao = s.depreciacao / 12;
  return months.map((month, i) => {
    const factor = Math.pow(1 + s.sazonalidade / 100, i);
    const receitaBruta = baseReceita * factor;
    const receitaLiquida = receitaBruta * (1 - s.deducoes / 100);
    const cmv = receitaLiquida * (s.cmvPercent / 100);
    const lucroBruto = receitaLiquida - cmv;
    const despesasVariaveis = receitaLiquida * (s.despesasVariaveis / 100);
    const despesasOperacionais = baseDespesasFixas + despesasVariaveis;
    const ebitda = lucroBruto - despesasOperacionais;
    const ebit = ebitda - baseDepreciacao;
    const laIR = ebit;
    const ir = Math.max(0, laIR * 0.34);
    const lucroLiquido = laIR - ir;
    return {
      month,
      receitaBruta,
      receitaLiquida,
      cmv,
      lucroBruto,
      despesasOperacionais,
      ebitda,
      depreciacao: baseDepreciacao,
      ebit,
      ir,
      lucroLiquido,
    };
  });
}

function calculateBalanco(dre, s = state) {
  const contasReceber = dre.receitaLiquida * (s.pmr / 365);
  const estoque = dre.cmv * (s.pme / 365);
  const compras = dre.cmv;
  const contasPagar = compras * (s.pmp / 365);

  const ativoNaoCirculante = s.receitaBruta * 0.30;
  const passivoNaoCirculante = s.receitaBruta * 0.20;
  const capitalSocial = s.receitaBruta * 0.10;
  const lucrosAcumulados = dre.lucroLiquido;
  const outrasObrigacoes = s.receitaBruta * 0.05;

  const totalPassivoPL = contasPagar + outrasObrigacoes + passivoNaoCirculante + capitalSocial + lucrosAcumulados;
  const ativoCirculanteExclCaixa = contasReceber + estoque;
  const caixa = totalPassivoPL - ativoCirculanteExclCaixa - ativoNaoCirculante;

  const ativoCirculante = ativoCirculanteExclCaixa + caixa;
  const ativoTotal = ativoCirculante + ativoNaoCirculante;

  return {
    caixa,
    contasReceber,
    estoque,
    ativoCirculante,
    ativoNaoCirculante,
    ativoTotal,
    contasPagar,
    outrasObrigacoes,
    passivoCirculante: contasPagar + outrasObrigacoes,
    passivoNaoCirculante,
    capitalSocial,
    lucrosAcumulados,
    patrimonioLiquido: capitalSocial + lucrosAcumulados,
    totalPassivoPL,
  };
}

function calculateGiro(balanco, s = state) {
  const ccc = s.pme + s.pmr - s.pmp;
  const aco = balanco.contasReceber + balanco.estoque;
  const pco = balanco.contasPagar;
  const ncg = aco - pco;
  const cdg = balanco.caixa + balanco.outrasObrigacoes;
  const tesouraria = cdg - ncg;
  return { ccc, aco, pco, ncg, cdg, tesouraria };
}

function projectCash(s = state) {
  const monthly = [];
  const base = s.receitaBruta / 12;
  let caixa = 0;
  for (let i = 1; i <= 12; i++) {
    const receita = base * Math.pow(1 + s.sazonalidade / 100, i - 1);
    const rl = receita * (1 - s.deducoes / 100);
    const cmv = rl * (s.cmvPercent / 100);
    const lucroBruto = rl - cmv;
    const despesas = s.despesasFixas / 12 + rl * (s.despesasVariaveis / 100);
    const ebitda = lucroBruto - despesas;
    const ll = ebitda * (1 - 0.34);
    const ncg = rl * (s.pmr / 365) + cmv * (s.pme / 365) - cmv * (s.pmp / 365);
    caixa += ll - ncg;
    monthly.push({ month: i, caixa });
  }
  return monthly;
}

function renderDreTable(tableId, indicatorsId, dre, divisor) {
  const rows = [
    ['Receita Bruta', dre.receitaBruta / divisor, 'pos', 'Faturamento total antes de deduções e impostos.', ''],
    ['(−) Deduções/Impostos', (-dre.receitaBruta + dre.receitaLiquida) / divisor, 'neg', 'ICMS, PIS/COFINS, IPI, devoluções e descontos.', ''],
    ['Receita Líquida', dre.receitaLiquida / divisor, 'total', 'Valor efetivo gerado por vendas.', 'Receita Líquida'],
    ['(−) CMV', -dre.cmv / divisor, 'neg', 'Custo da mercadoria vendida ou custo dos serviços prestados.', 'CMV'],
    ['Lucro Bruto', dre.lucroBruto / divisor, 'sub', 'Receita líquida menos custos.', 'Lucro Bruto'],
    ['(−) Despesas Operacionais', -dre.despesasOperacionais / divisor, 'neg', 'Despesas fixas e variáveis do dia a dia.', ''],
    ['EBITDA', dre.ebitda / divisor, 'sub', 'Resultado operacional antes de depreciação e impostos.', 'EBITDA'],
    ['(−) Depreciação', -dre.depreciacao / divisor, 'neg', 'Custo do desgaste de ativos imobilizados.', ''],
    ['EBIT', dre.ebit / divisor, 'sub', 'Lucro operacional antes de juros e impostos.', 'EBIT'],
    ['(−) IR/CSLL', -dre.ir / divisor, 'neg', 'Tributos sobre o lucro.', ''],
    ['Lucro Líquido', dre.lucroLiquido / divisor, 'total', 'Resultado final disponível para os acionistas.', 'Lucro Líquido'],
  ];

  const tbody = document.querySelector(`#${tableId} tbody`);
  tbody.innerHTML = rows
    .map(([name, value, cls, tip, term]) => {
      const isTotal = cls === 'total';
      const className = isTotal ? 'total' : cls === 'sub' ? '' : cls;
      const displayName = term ? `<span class="term" data-term="${term}">${name}</span>` : name;
      return `<tr class="${className}" title="${tip}"><td>${displayName}</td><td>${formatCurrency(value)}</td></tr>`;
    })
    .join('');

  const margemBruta = (dre.lucroBruto / dre.receitaLiquida) * 100;
  const margemEbitda = (dre.ebitda / dre.receitaLiquida) * 100;
  const margemLiquida = (dre.lucroLiquido / dre.receitaLiquida) * 100;

  document.getElementById(indicatorsId).innerHTML = `
    <div class="indicator"><span class="label">Margem Bruta</span><span class="value">${margemBruta.toFixed(1).replace('.', ',')}%</span></div>
    <div class="indicator"><span class="label">Margem EBITDA</span><span class="value">${margemEbitda.toFixed(1).replace('.', ',')}%</span></div>
    <div class="indicator"><span class="label">Margem Líquida</span><span class="value">${margemLiquida.toFixed(1).replace('.', ',')}%</span></div>
  `;
}

function updateDRE() {
  const dre = calculateDRE();
  renderDreTable('dreTable', 'dreIndicators', dre, 1);
  renderDreTable('dreTableMonthly', 'dreIndicatorsMonthly', dre, 12);
  initInlineTooltips();
  renderWaterfall(dre);
  renderCompareDRE(dre);
}

function renderWaterfall(dre) {
  const divisor = viewMode === 'monthly' ? 12 : 1;
  const items = [
    ['Receita Líquida', dre.receitaLiquida / divisor, 'pos'],
    ['CMV', -dre.cmv / divisor, 'neg'],
    ['Desp. Op.', -dre.despesasOperacionais / divisor, 'neg'],
    ['Deprec.', -dre.depreciacao / divisor, 'neg'],
    ['IR/CSLL', -dre.ir / divisor, 'neg'],
    ['Lucro Líquido', dre.lucroLiquido / divisor, 'total'],
  ];

  const maxVal = Math.max(dre.receitaLiquida / divisor, ...items.map((i) => Math.abs(i[1])));
  const container = document.getElementById('dreWaterfall');
  container.innerHTML = items
    .map(([label, value, cls]) => {
      const height = Math.max(4, (Math.abs(value) / maxVal) * 260);
      const color = cls === 'total' ? 'total' : value >= 0 ? 'pos' : 'neg';
      return `
        <div class="waterfall-item">
          <div class="waterfall-bar ${color}" style="height:${height}px">
            <span class="waterfall-value">${formatCurrency(value)}</span>
          </div>
          <div class="waterfall-label">${label}</div>
        </div>`;
    })
    .join('');
}

function renderCompareDRE(dre) {
  const container = document.getElementById('compareDre');
  if (!savedScenario) {
    container.innerHTML = '<p class="hint">Salve um cenário no Painel de Premissas para comparar.</p>';
    return;
  }
  const old = calculateDRE(savedScenario);
  const metrics = [
    ['Receita Líquida', 'receitaLiquida'],
    ['Lucro Bruto', 'lucroBruto'],
    ['EBITDA', 'ebitda'],
    ['Lucro Líquido', 'lucroLiquido'],
  ];
  container.innerHTML = metrics
    .map(([label, key]) => {
      const a = old[key];
      const b = dre[key];
      const diff = b - a;
      const pct = a !== 0 ? ((diff / a) * 100).toFixed(1).replace('.', ',') : '0,0';
      const color = diff >= 0 ? 'var(--success)' : 'var(--danger)';
      return `
        <div class="compare-item">
          <div class="label">${label}</div>
          <div class="values">
            <span>${formatCurrency(a)}</span>
            <span>→</span>
            <span>${formatCurrency(b)}</span>
          </div>
          <div style="color:${color};font-weight:700;font-size:0.85rem;margin-top:4px">
            ${diff >= 0 ? '+' : ''}${formatCurrency(diff)} (${pct}%)
          </div>
        </div>`;
    })
    .join('');
}

function updateBalanco() {
  const dre = calculateDRE();
  const b = calculateBalanco(dre);
  const data = [
    ['Caixa', b.caixa, 'caixa', 'Caixa calculado como conta de fechamento: Ativo = Passivo + PL.'],
    ['Contas a Receber', b.contasReceber, 'receber', `Receita Líquida × PMR ÷ 365 = ${formatCurrency(dre.receitaLiquida)} × ${state.pmr} ÷ 365`],
    ['Estoque', b.estoque, 'estoque', `CMV × PME ÷ 365 = ${formatCurrency(dre.cmv)} × ${state.pme} ÷ 365`],
    ['Ativo Não Circulante', b.ativoNaoCirculante, 'anc', 'Imobilizado estimado como 30% da receita bruta.'],
  ];

  const ativoItems = data.slice(0, 3);
  const anItems = data.slice(3, 4);

  renderBlock('#ativoCirculante .block-items', ativoItems, 'A');
  renderBlock('#ativoNaoCirculante .block-items', anItems, 'A');
  document.getElementById('totalAtivo').textContent = `Total Ativo: ${formatCurrency(b.ativoTotal)}`;

  const passivoItems = [
    ['Contas a Pagar', b.contasPagar, 'pagar', `CMV × PMP ÷ 365 = ${formatCurrency(dre.cmv)} × ${state.pmp} ÷ 365`],
    ['Outras Obrigações', b.outrasObrigacoes, 'outras', 'Obrigações operacionais estimadas como 5% da receita bruta.'],
  ];
  const pnpItems = [['Passivo Não Circulante', b.passivoNaoCirculante, 'pnp', 'Empréstimos de longo prazo estimados como 20% da receita bruta.']];
  const plItems = [
    ['Capital Social', b.capitalSocial, 'cs', 'Capital social estimado como 10% da receita bruta.'],
    ['Lucros Acumulados', b.lucrosAcumulados, 'la', 'Lucro Líquido do exercício transferido para o PL.'],
  ];

  renderBlock('#passivoCirculante .block-items', passivoItems, 'P');
  renderBlock('#passivoNaoCirculante .block-items', pnpItems, 'P');
  renderBlock('#patrimonioLiquido .block-items', plItems, 'P');
  document.getElementById('totalPassivoPL').textContent = `Total Passivo + PL: ${formatCurrency(b.totalPassivoPL)}`;

  if (selectedTrace) {
    showTrace(selectedTrace);
  }
}

function renderBlock(selector, items, side) {
  const container = document.querySelector(selector);
  container.innerHTML = items
    .map(([name, value, key, desc]) => {
      const negative = value < 0;
      return `
        <div class="block-item" data-side="${side}" data-key="${key}" data-desc="${desc.replace(/"/g, '&quot;')}" data-name="${name}">
          <span class="name">${name}</span>
          <span class="value" style="color:${negative ? 'var(--danger)' : 'inherit'}">${formatCurrency(value)}</span>
        </div>`;
    })
    .join('');

  container.querySelectorAll('.block-item').forEach((el) => {
    el.addEventListener('click', () => {
      selectedTrace = {
        key: el.dataset.key,
        name: el.dataset.name,
        desc: el.dataset.desc,
        side: el.dataset.side,
      };
      document.querySelectorAll('.block-item').forEach((i) => i.classList.remove('selected'));
      el.classList.add('selected');
      showTrace(selectedTrace);
    });
  });
}

function showTrace(item) {
  const sideLabel = item.side === 'A' ? 'Ativo' : 'Passivo + PL';
  document.getElementById('traceInfo').innerHTML = `
    <strong>${item.name}</strong> (${sideLabel})<br>
    <span style="color:var(--text-muted)">${item.desc}</span>
  `;
}

function updateGiro() {
  const dre = calculateDRE();
  const b = calculateBalanco(dre);
  const g = calculateGiro(b);

  document.getElementById('metricCCC').textContent = `${g.ccc} dias`;
  document.getElementById('metricNCG').textContent = formatCurrency(g.ncg);
  document.getElementById('metricCDG').textContent = formatCurrency(g.cdg);
  const tes = document.getElementById('metricTesouraria');
  tes.textContent = formatCurrency(g.tesouraria);
  tes.style.color = g.tesouraria >= 0 ? 'var(--success)' : 'var(--danger)';

  const health = document.getElementById('metricHealth');
  if (g.tesouraria > 0) {
    health.textContent = 'Saudável';
    health.className = 'metric-health healthy';
  } else if (g.tesouraria === 0) {
    health.textContent = 'Apertado';
    health.className = 'metric-health warning';
  } else {
    health.textContent = 'Crítico';
    health.className = 'metric-health critical';
  }

  document.getElementById('timelineCCC').innerHTML = `
    <div class="timeline-phase pme">PME<br>${state.pme}d</div>
    <span class="timeline-arrow">→</span>
    <div class="timeline-phase pmr">PMR<br>${state.pmr}d</div>
    <span class="timeline-arrow">→</span>
    <div class="timeline-phase pmp">− PMP<br>${state.pmp}d</div>
    <span class="timeline-arrow">=</span>
    <div class="timeline-phase" style="background:#1e293b;color:var(--accent)">CCC<br>${g.ccc}d</div>
  `;

  const monthly = projectCash();
  const maxAbs = Math.max(...monthly.map((m) => Math.abs(m.caixa)), 1);
  document.getElementById('cashChart').innerHTML = monthly
    .map((m) => {
      const height = Math.max(4, (Math.abs(m.caixa) / maxAbs) * 180);
      const color = m.caixa >= 0 ? 'pos' : 'neg';
      return `
        <div class="chart-bar ${color}" style="height:${height}px">
          <span class="chart-bar-label">M${m.month}</span>
        </div>`;
    })
    .join('');

  // Régua visual CCC
  const maxDias = Math.max(180, state.pme + state.pmr, state.pmp, g.ccc);
  const pct = (v) => Math.min(100, Math.max(0, (v / maxDias) * 100));
  document.getElementById('rulerPme').style.left = `${pct(state.pme)}%`;
  document.getElementById('rulerPmr').style.left = `${pct(state.pme + state.pmr)}%`;
  document.getElementById('rulerPmp').style.left = `${pct(state.pmp)}%`;
  document.querySelector('.ruler-label.pme').style.left = `${pct(state.pme)}%`;
  document.querySelector('.ruler-label.pmr').style.left = `${pct(state.pme + state.pmr)}%`;
  document.querySelector('.ruler-label.pmp').style.left = `${pct(state.pmp)}%`;
  document.querySelector('.ruler-label.pme').textContent = `PME ${state.pme}d`;
  document.querySelector('.ruler-label.pmr').textContent = `PMR ${state.pmr}d`;
  document.querySelector('.ruler-label.pmp').textContent = `PMP ${state.pmp}d`;
}

function updateAllFeedbacks() {
  const ccc = state.pme + state.pmr - state.pmp;
  const dre = calculateDRE();
  const b = calculateBalanco(dre);
  const g = calculateGiro(b);

  // Premissas
  const elPrem = document.querySelector('#feedbackPremissas');
  const spanPrem = elPrem.querySelector('span');
  const msgsPrem = [];
  if (state.pmp > state.pme + state.pmr) {
    msgsPrem.push('Seu PMP é maior que PME + PMR: os fornecedores financiam todo o ciclo operacional.');
    elPrem.className = 'card feedback info';
  } else if (ccc > 60) {
    msgsPrem.push(`Ciclo de Conversão de Caixa de ${ccc} dias. Considere negociar prazos ou reduzir estoque.`);
    elPrem.className = 'card feedback warning';
  } else {
    msgsPrem.push(`Ciclo de Conversão de Caixa de ${ccc} dias. Nível operacional razoável para muitos negócios.`);
    elPrem.className = 'card feedback';
  }
  if (state.cmvPercent > 60) {
    msgsPrem.push('CMV elevado. Analise preço de compra/venda e mix de produtos.');
    elPrem.className = 'card feedback warning';
  }
  spanPrem.textContent = msgsPrem.join(' ');

  // DRE
  const elDre = document.querySelector('#feedbackDre');
  const spanDre = elDre.querySelector('span');
  const margemBruta = (dre.lucroBruto / dre.receitaLiquida) * 100;
  const margemLiquida = (dre.lucroLiquido / dre.receitaLiquida) * 100;
  if (margemBruta < 20) {
    spanDre.textContent = 'Margem bruta abaixo de 20%. Reveja preços ou estrutura de custos.';
    elDre.className = 'card feedback warning';
  } else if (margemLiquida < 5) {
    spanDre.textContent = 'Margem líquida apertada. Pequenas variações de custo ou prazo podem zerar o lucro.';
    elDre.className = 'card feedback warning';
  } else {
    spanDre.textContent = `DRE saudável: margem bruta de ${margemBruta.toFixed(1).replace('.', ',')}% e margem líquida de ${margemLiquida.toFixed(1).replace('.', ',')}%.`;
    elDre.className = 'card feedback';
  }

  // Balanço
  const elBal = document.querySelector('#feedbackBalanco');
  const spanBal = elBal.querySelector('span');
  const aco = b.contasReceber + b.estoque;
  const pco = b.contasPagar;
  if (aco > pco * 2) {
    spanBal.textContent = 'Seu Ativo Circulante Operacional é bem maior que o Passivo Circulante Operacional. Isso geralmente aumenta a NCG e exige mais capital.';
    elBal.className = 'card feedback warning';
  } else if (b.caixa < 0) {
    spanBal.textContent = 'O caixa calculado como fechamento ficou negativo. O passivo+PL não cobre os investimentos e o giro sem geração de caixa extra.';
    elBal.className = 'card feedback critical';
  } else {
    spanBal.textContent = 'Estrutura de balanço equilibrada: Ativo = Passivo + PL. Acompanhe o crescimento do AC em relação ao PC.';
    elBal.className = 'card feedback';
  }

  // Capital de Giro
  const elGiro = document.querySelector('#feedbackGiro');
  const spanGiro = elGiro.querySelector('span');
  if (g.tesouraria < 0) {
    spanGiro.textContent = 'Tesouraria negativa: a NCG supera o CDG. Você precisa de mais fontes de financiamento ou reduzir o ciclo de caixa.';
    elGiro.className = 'card feedback critical';
  } else if (g.tesouraria < g.ncg * 0.1) {
    spanGiro.textContent = 'Tesouraria positiva, mas baixa em relação à NCG. Situação apertada.';
    elGiro.className = 'card feedback warning';
  } else {
    spanGiro.textContent = 'Tesouraria confortável. O CDG cobre a NCG e ainda sobra folga para imprevistos.';
    elGiro.className = 'card feedback';
  }
}

function updateAll() {
  updateDRE();
  updateBalanco();
  updateGiro();
  updateAllFeedbacks();
  checkChallenges();
  updateProgress();
}

function initTabs() {
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    });
  });
}

function initActions() {
  document.getElementById('btnPadrao').addEventListener('click', () => {
    state = { ...defaultState };
    inputDefs.forEach(([key]) => {
      inputs[key].value = state[key];
      displays[key].textContent = getFormatter(key)(state[key]);
    });
    updateAll();
  });

  document.getElementById('btnSalvar').addEventListener('click', () => {
    savedScenario = { ...state };
    renderCompareDRE(calculateDRE());
    alert('Cenário salvo! Vá até o módulo DRE para ver o comparativo.');
  });

  document.getElementById('btnExportar').addEventListener('click', () => {
    const dre = calculateDRE();
    const b = calculateBalanco(dre);
    const g = calculateGiro(b);
    const content = `
      <h1>FinSim - Cenário</h1>
      <h2>Premissas</h2>
      <ul>
        <li>Receita Bruta: ${formatCurrency(state.receitaBruta)}</li>
        <li>Deduções: ${formatPercent(state.deducoes)}</li>
        <li>CMV: ${formatPercent(state.cmvPercent)}</li>
        <li>Despesas Fixas: ${formatCurrency(state.despesasFixas)}</li>
        <li>Despesas Variáveis: ${formatPercent(state.despesasVariaveis)}</li>
        <li>PMR: ${state.pmr} dias</li>
        <li>PME: ${state.pme} dias</li>
        <li>PMP: ${state.pmp} dias</li>
      </ul>
      <h2>DRE</h2>
      <ul>
        <li>Receita Líquida: ${formatCurrency(dre.receitaLiquida)}</li>
        <li>Lucro Bruto: ${formatCurrency(dre.lucroBruto)}</li>
        <li>EBITDA: ${formatCurrency(dre.ebitda)}</li>
        <li>Lucro Líquido: ${formatCurrency(dre.lucroLiquido)}</li>
      </ul>
      <h2>Balanço</h2>
      <ul>
        <li>Total Ativo: ${formatCurrency(b.ativoTotal)}</li>
        <li>Total Passivo + PL: ${formatCurrency(b.totalPassivoPL)}</li>
        <li>Caixa: ${formatCurrency(b.caixa)}</li>
      </ul>
      <h2>Capital de Giro</h2>
      <ul>
        <li>CCC: ${g.ccc} dias</li>
        <li>NCG: ${formatCurrency(g.ncg)}</li>
        <li>CDG: ${formatCurrency(g.cdg)}</li>
        <li>Tesouraria: ${formatCurrency(g.tesouraria)}</li>
      </ul>
    `;
    const win = window.open('', '_blank');
    win.document.write(`
      <html><head><title>FinSim - Cenário</title>
      <style>body{font-family:Segoe UI,Roboto,sans-serif;padding:40px;background:#fff;color:#111} h1,h2{color:#0f172a} ul{line-height:1.8}</style>
      </head><body>${content}<button onclick="window.print()">Imprimir / Salvar PDF</button></body></html>
    `);
    win.document.close();
  });

  document.getElementById('btnComparar').addEventListener('click', () => {
    document.querySelector('[data-tab="dre"]').click();
  });

  document.getElementById('btnSimPmp').addEventListener('click', () => simulateScenario('pmp', -10));
  document.getElementById('btnSimPmr').addEventListener('click', () => simulateScenario('pmr', -10));
  document.getElementById('btnSimPme').addEventListener('click', () => simulateScenario('pme', 10));
  document.getElementById('btnNextDre').addEventListener('click', () => {
    document.querySelector('[data-tab="dre"]').click();
  });
  document.getElementById('btnChallengeGiro').addEventListener('click', () => {
    document.querySelector('[data-tab="aprender"]').click();
  });
}

function simulateScenario(key, delta) {
  const newState = { ...state, [key]: Math.max(0, state[key] + delta) };
  const dre = calculateDRE(newState);
  const b = calculateBalanco(dre, newState);
  const g = calculateGiro(b, newState);
  const oldG = calculateGiro(calculateBalanco(calculateDRE(state), state), state);
  const diff = g.tesouraria - oldG.tesouraria;
  const labels = { pmp: 'PMP', pmr: 'PMR', pme: 'PME' };
  document.getElementById('scenarioResult').innerHTML = `
    <strong>Se ${labels[key]} ${delta >= 0 ? 'aumentar' : 'diminuir'} ${Math.abs(delta)} dias:</strong><br>
    CCC passa para <strong>${g.ccc} dias</strong>.<br>
    NCG passa para <strong>${formatCurrency(g.ncg)}</strong>.<br>
    Saldo de Tesouraria passa para <strong>${formatCurrency(g.tesouraria)}</strong>
    (<span style="color:${diff >= 0 ? 'var(--success)' : 'var(--danger)'}">${diff >= 0 ? '+' : ''}${formatCurrency(diff)}</span>).
  `;
}

function getFormatter(key) {
  const found = inputDefs.find(([k]) => k === key);
  return found ? found[2] : (v) => v;
}

/* Aprender */
const glossaryTerms = {
  'Receita Líquida': 'Receita Bruta menos deduções, impostos e devoluções. É o valor efetivo que a empresa tem para pagar custos e despesas.',
  'CMV': 'Custo da Mercadoria Vendida. Representa o custo dos produtos/serviços vendidos no período.',
  'EBITDA': 'Lucro antes de juros, impostos, depreciação e amortização. Indica a geração de caixa operacional.',
  'EBIT': 'Lucro operacional antes de juros e impostos. Mostra a rentabilidade do negócio sem efeito financeiro.',
  'Lucro Líquido': 'Resultado final da empresa após todos os custos, despesas e tributos.',
  'PMR': 'Prazo Médio de Recebimento: quantos dias, em média, a empresa demora para receber de clientes.',
  'PME': 'Prazo Médio de Estoque: quantos dias, em média, a mercadoria fica parada antes de ser vendida.',
  'PMP': 'Prazo Médio de Pagamento: quantos dias, em média, a empresa demora para pagar fornecedores.',
  'CCC': 'Ciclo de Conversão de Caixa: PME + PMR − PMP. Quanto menor, menos recurso fica preso no giro.',
  'NCG': 'Necessidade de Capital de Giro: Ativo Circulante Operacional − Passivo Circulante Operacional.',
  'CDG': 'Capital de Giro Líquido: recursos disponíveis para financiar o giro (caixa + recursos de curto prazo).',
  'Tesouraria': 'Saldo de Tesouraria = CDG − NCG. Positivo indica folga; negativo, necessidade de financiamento.',
  'Ativo Circulante': 'Bens e direitos de curto prazo (até 1 ano): caixa, contas a receber e estoque.',
  'Ativo Não Circulante': 'Bens e direitos de longo prazo: imobilizado, investimentos e intangível.',
  'Passivo Circulante': 'Obrigações de curto prazo: contas a pagar, empréstimos de curto prazo, salários etc.',
  'Passivo Não Circulante': 'Obrigações de longo prazo: empréstimos e financiamentos a pagar após 1 ano.',
  'Patrimônio Líquido': 'Recursos próprios da empresa: capital social, reservas e lucros acumulados.',
  'Lucros Acumulados': 'Lucros retidos no negócio, que aumentam o Patrimônio Líquido.',
};

function initAprender() {
  const dl = document.getElementById('glossary');
  dl.innerHTML = Object.entries(glossaryTerms)
    .map(([term, def]) => `<dt class="term" data-term="${term}">${term}</dt><dd>${def}</dd>`)
    .join('');
  dl.querySelectorAll('dt').forEach((dt) => {
    dt.addEventListener('click', () => {
      dt.nextElementSibling.classList.toggle('open');
      trackProgress('glossary', dt.textContent);
    });
  });
  initInlineTooltips();

  const questions = [
    {
      q: 'O que acontece com o caixa se o PMP aumenta (e tudo o mais constante)?',
      options: ['Melhora', 'Piora', 'Não muda'],
      correct: 0,
    },
    {
      q: 'Qual fórmula correta do Ciclo de Conversão de Caixa?',
      options: ['PME + PMR − PMP', 'PME − PMR + PMP', 'PMR + PMP − PME'],
      correct: 0,
    },
    {
      q: 'No balanço, o Lucro Líquido vai parar onde?',
      options: ['Ativo Circulante', 'Passivo Circulante', 'Patrimônio Líquido'],
      correct: 2,
    },
  ];

  const quizContainer = document.getElementById('quizContainer');
  quizContainer.innerHTML = questions
    .map((q, qi) => {
      const opts = q.options
        .map((opt, oi) => `<div class="quiz-option" data-q="${qi}" data-o="${oi}">${opt}</div>`)
        .join('');
      return `<div class="quiz-question"><strong>${q.q}</strong><div class="quiz-options">${opts}</div></div>`;
    })
    .join('');

  quizContainer.querySelectorAll('.quiz-option').forEach((opt) => {
    opt.addEventListener('click', () => {
      const qi = parseInt(opt.dataset.q);
      const oi = parseInt(opt.dataset.o);
      const question = quizContainer.querySelectorAll('.quiz-question')[qi];
      question.querySelectorAll('.quiz-option').forEach((o) => o.classList.remove('correct', 'wrong'));
      if (oi === questions[qi].correct) {
        opt.classList.add('correct');
        trackProgress('quiz', qi);
      } else {
        opt.classList.add('wrong');
        question.querySelectorAll('.quiz-option')[questions[qi].correct].classList.add('correct');
      }
    });
  });

  initChallenges();
  updateProgress();
}

function trackProgress(type, id) {
  const key = `finsim_progress_${type}`;
  const seen = JSON.parse(localStorage.getItem(key) || '[]');
  if (!seen.includes(id)) {
    seen.push(id);
    localStorage.setItem(key, JSON.stringify(seen));
    updateProgress();
  }
}

function updateProgress() {
  const glossarySeen = JSON.parse(localStorage.getItem('finsim_progress_glossary') || '[]');
  const quizSeen = JSON.parse(localStorage.getItem('finsim_progress_quiz') || '[]');
  const totalTerms = Object.keys(glossaryTerms).length;
  const totalQuiz = 3;
  const challengeDone = challenges.filter((c) => c.check()).length;
  const total = totalTerms + totalQuiz + challenges.length;
  const done = glossarySeen.length + quizSeen.length + challengeDone;
  const pct = total ? (done / total) * 100 : 0;
  const fill = document.getElementById('progressFill');
  const stats = document.getElementById('progressStats');
  if (fill && stats) {
    fill.style.width = `${pct}%`;
    stats.innerHTML = `
      <span><strong>${glossarySeen.length}/${totalTerms}</strong> termos do glossário</span>
      <span><strong>${quizSeen.length}/${totalQuiz}</strong> quiz</span>
      <span><strong>${challengeDone}/${challenges.length}</strong> desafios</span>
    `;
  }
}

const challenges = [
  {
    id: 'c1',
    title: 'Reduza o CCC em 15 dias sem perder margem',
    desc: 'Mantenha receita e CMV estáveis. Altere PMR, PME ou PMP para reduzir o CCC em pelo menos 15 dias.',
    check: () => {
      const current = state.pme + state.pmr - state.pmp;
      return (defaultState.pme + defaultState.pmr - defaultState.pmp) - current >= 15;
    },
  },
  {
    id: 'c2',
    title: 'Alcance saldo de tesouraria positivo',
    desc: 'Ajuste prazos e custos para que CDG − NCG seja maior que zero.',
    check: () => {
      const g = calculateGiro(calculateBalanco(calculateDRE()), state);
      return g.tesouraria > 0;
    },
  },
  {
    id: 'c3',
    title: 'Margem EBITDA acima de 30%',
    desc: 'Ajuste CMV e despesas para obter margem EBITDA superior a 30%.',
    check: () => {
      const dre = calculateDRE();
      return (dre.ebitda / dre.receitaLiquida) * 100 > 30;
    },
  },
];

function initChallenges() {
  const container = document.getElementById('challenges');
  container.innerHTML = challenges
    .map((c) => `<div class="challenge" data-id="${c.id}">
      <strong>${c.title}</strong>
      <p>${c.desc}</p>
      <span class="challenge-status pending">Pendente</span>
    </div>`)
    .join('');
  checkChallenges();
}

function checkChallenges() {
  document.querySelectorAll('.challenge').forEach((el) => {
    const id = el.dataset.id;
    const challenge = challenges.find((c) => c.id === id);
    const done = challenge.check();
    const status = el.querySelector('.challenge-status');
    status.textContent = done ? 'Concluído!' : 'Pendente';
    status.className = `challenge-status ${done ? 'done' : 'pending'}`;
  });
}

function initOnboarding() {
  const overlay = document.getElementById('onboarding');
  if (localStorage.getItem('finsim_onboarding_done') === '1') {
    overlay.classList.add('hidden');
    return;
  }
  const slides = document.querySelectorAll('.onboarding-slide');
  const dots = document.querySelectorAll('.dot');
  const btnPrev = document.getElementById('btnOnboardingPrev');
  const btnNext = document.getElementById('btnOnboardingNext');
  const btnSkip = document.getElementById('btnOnboardingSkip');
  let current = 0;

  function show(i) {
    slides.forEach((s, idx) => s.classList.toggle('active', idx === i));
    dots.forEach((d, idx) => d.classList.toggle('active', idx === i));
    btnPrev.style.visibility = i === 0 ? 'hidden' : 'visible';
    btnNext.textContent = i === slides.length - 1 ? 'Começar' : 'Próximo';
  }

  btnNext.addEventListener('click', () => {
    if (current < slides.length - 1) {
      current++;
      show(current);
    } else {
      localStorage.setItem('finsim_onboarding_done', '1');
      overlay.classList.add('hidden');
    }
  });

  btnPrev.addEventListener('click', () => {
    if (current > 0) { current--; show(current); }
  });

  btnSkip.addEventListener('click', () => {
    localStorage.setItem('finsim_onboarding_done', '1');
    overlay.classList.add('hidden');
  });

  show(0);
}

function initInlineTooltips() {
  const tooltip = document.createElement('div');
  tooltip.className = 'tooltip';
  document.body.appendChild(tooltip);

  document.querySelectorAll('.term').forEach((el) => {
    const term = el.dataset.term;
    const def = glossaryTerms[term] || 'Termo técnico';
    el.addEventListener('mouseenter', (e) => {
      tooltip.innerHTML = `<strong>${term}</strong><br>${def}<br><a class="goto-glossary">Ver no glossário</a>`;
      tooltip.classList.add('visible');
      const rect = el.getBoundingClientRect();
      const ttRect = tooltip.getBoundingClientRect();
      let left = rect.left + (rect.width - ttRect.width) / 2 + window.scrollX;
      let top = rect.bottom + 8 + window.scrollY;
      if (left < 10) left = 10;
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
    });
    el.addEventListener('mouseleave', () => tooltip.classList.remove('visible'));
  });

  tooltip.addEventListener('click', (e) => {
    if (e.target.classList.contains('goto-glossary')) {
      document.querySelector('[data-tab="aprender"]').click();
      tooltip.classList.remove('visible');
    }
  });
}

function renderMonthlyGrid() {
  const monthly = calculateDREMonthly();
  const grid = document.getElementById('monthlyGrid');
  grid.innerHTML = monthly
    .map((m) => {
      const rows = [
        ['Receita Líquida', m.receitaLiquida, 'total'],
        ['(−) CMV', -m.cmv, 'neg'],
        ['Lucro Bruto', m.lucroBruto, 'pos'],
        ['(−) Desp. Op.', -m.despesasOperacionais, 'neg'],
        ['EBITDA', m.ebitda, 'pos'],
        ['(−) Deprec.', -m.depreciacao, 'neg'],
        ['EBIT', m.ebit, 'pos'],
        ['(−) IR/CSLL', -m.ir, 'neg'],
        ['Lucro Líquido', m.lucroLiquido, 'total'],
      ];
      const body = rows
        .map(([label, value, cls]) => `
          <div class="month-row ${cls}">
            <span class="label">${label}</span>
            <span class="value">${formatCurrency(value)}</span>
          </div>`)
        .join('');
      return `<div class="month-card"><h4>${m.month}</h4>${body}</div>`;
    })
    .join('');
}

function initMonthlyGrid() {
  const grid = document.getElementById('monthlyGrid');
  const btn = document.getElementById('btnToggleCalendar');
  if (!btn) return;
  renderMonthlyGrid();
  btn.addEventListener('click', () => {
    const hidden = grid.classList.toggle('hidden');
    btn.textContent = hidden ? 'Mostrar' : 'Ocultar';
  });
}

function init() {
  initOnboarding();
  initTabs();
  initViewToggle();
  initInputs();
  initActions();
  initMonthlyGrid();
  initInlineTooltips();
  initAprender();
  updateAll();
}

init();
