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

const inputs = {};
const displays = {};

const inputDefs = [
  ['receitaBruta', 'valReceitaBruta', formatCurrency],
  ['deducoes', 'valDeducoes', formatPercent],
  ['cmvPercent', 'valCmvPercent', formatPercent],
  ['despesasFixas', 'valDespesasFixas', formatCurrency],
  ['despesasVariaveis', 'valDespesasVariaveis', formatPercent],
  ['pmr', 'valPmr', (v) => `${v} dias`],
  ['pme', 'valPme', (v) => `${v} dias`],
  ['pmp', 'valPmp', (v) => `${v} dias`],
  ['depreciacao', 'valDepreciacao', formatCurrency],
  ['sazonalidade', 'valSazonalidade', (v) => `${v > 0 ? '+' : ''}${v.toFixed(1).replace('.', ',')}% / mês`],
];

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
    ebit,
    resultadoFinanceiro,
    laIR,
    ir,
    lucroLiquido,
  };
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

function updateDRE() {
  const dre = calculateDRE();
  const rows = [
    ['Receita Bruta', dre.receitaBruta, 'pos', 'Faturamento total antes de deduções e impostos.'],
    ['(−) Deduções/Impostos', -dre.receitaBruta + dre.receitaLiquida, 'neg', 'ICMS, PIS/COFINS, IPI, devoluções e descontos.'],
    ['Receita Líquida', dre.receitaLiquida, 'total', 'Valor efetivo gerado por vendas.'],
    ['(−) CMV', -dre.cmv, 'neg', 'Custo da mercadoria vendida ou custo dos serviços prestados.'],
    ['Lucro Bruto', dre.lucroBruto, 'sub', 'Receita líquida menos custos.'],
    ['(−) Despesas Operacionais', -dre.despesasOperacionais, 'neg', 'Despesas fixas e variáveis do dia a dia.'],
    ['EBITDA', dre.ebitda, 'sub', 'Resultado operacional antes de depreciação e impostos.'],
    ['(−) Depreciação', -dre.depreciacao, 'neg', 'Custo do desgaste de ativos imobilizados.'],
    ['EBIT', dre.ebit, 'sub', 'Lucro operacional antes de juros e impostos.'],
    ['(−) IR/CSLL', -dre.ir, 'neg', 'Tributos sobre o lucro.'],
    ['Lucro Líquido', dre.lucroLiquido, 'total', 'Resultado final disponível para os acionistas.'],
  ];

  const tbody = document.querySelector('#dreTable tbody');
  tbody.innerHTML = rows
    .map(([name, value, cls, tip]) => {
      const isTotal = cls === 'total';
      const className = isTotal ? 'total' : cls === 'sub' ? '' : cls;
      return `<tr class="${className}" title="${tip}"><td>${name}</td><td>${formatCurrency(value)}</td></tr>`;
    })
    .join('');

  const margemBruta = (dre.lucroBruto / dre.receitaLiquida) * 100;
  const margemEbitda = (dre.ebitda / dre.receitaLiquida) * 100;
  const margemLiquida = (dre.lucroLiquido / dre.receitaLiquida) * 100;

  document.getElementById('dreIndicators').innerHTML = `
    <div class="indicator"><span class="label">Margem Bruta</span><span class="value">${margemBruta.toFixed(1).replace('.', ',')}%</span></div>
    <div class="indicator"><span class="label">Margem EBITDA</span><span class="value">${margemEbitda.toFixed(1).replace('.', ',')}%</span></div>
    <div class="indicator"><span class="label">Margem Líquida</span><span class="value">${margemLiquida.toFixed(1).replace('.', ',')}%</span></div>
  `;

  renderWaterfall(dre);
  renderCompareDRE(dre);
}

function renderWaterfall(dre) {
  const items = [
    ['Receita Líquida', dre.receitaLiquida, 'pos'],
    ['CMV', -dre.cmv, 'neg'],
    ['Desp. Op.', -dre.despesasOperacionais, 'neg'],
    ['Deprec.', -dre.depreciacao, 'neg'],
    ['IR/CSLL', -dre.ir, 'neg'],
    ['Lucro Líquido', dre.lucroLiquido, 'total'],
  ];

  const maxVal = Math.max(dre.receitaLiquida, ...items.map((i) => Math.abs(i[1])));
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
}

function updateFeedback() {
  const el = document.querySelector('#feedbackPremissas span');
  const msgs = [];
  const ccc = state.pme + state.pmr - state.pmp;
  if (state.pmp > state.pme + state.pmr) {
    msgs.push('Seu PMP é maior que PME + PMR: os fornecedores financiam todo o ciclo operacional.');
  } else if (ccc > 60) {
    msgs.push(`Ciclo de Conversão de Caixa de ${ccc} dias. Considere negociar prazos ou reduzir estoque.`);
  } else {
    msgs.push(`Ciclo de Conversão de Caixa de ${ccc} dias. Nível operacional razoável para muitos negócios.`);
  }
  if (state.cmvPercent > 60) {
    msgs.push('CMV elevado. Analise preço de compra/venda e mix de produtos.');
  }
  el.textContent = msgs.join(' ');
}

function updateAll() {
  updateDRE();
  updateBalanco();
  updateGiro();
  updateFeedback();
  checkChallenges();
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

  document.getElementById('btnComparar').addEventListener('click', () => {
    document.querySelector('[data-tab="dre"]').click();
  });

  document.getElementById('btnSimPmp').addEventListener('click', () => simulateScenario('pmp', -10));
  document.getElementById('btnSimPmr').addEventListener('click', () => simulateScenario('pmr', -10));
  document.getElementById('btnSimPme').addEventListener('click', () => simulateScenario('pme', 10));
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
};

function initAprender() {
  const dl = document.getElementById('glossary');
  dl.innerHTML = Object.entries(glossaryTerms)
    .map(([term, def]) => `<dt>${term}</dt><dd>${def}</dd>`)
    .join('');
  dl.querySelectorAll('dt').forEach((dt) => {
    dt.addEventListener('click', () => dt.nextElementSibling.classList.toggle('open'));
  });

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
      } else {
        opt.classList.add('wrong');
        question.querySelectorAll('.quiz-option')[questions[qi].correct].classList.add('correct');
      }
    });
  });

  initChallenges();
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

function init() {
  initTabs();
  initInputs();
  initActions();
  initAprender();
  updateAll();
}

init();
