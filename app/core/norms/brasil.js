// URBIS - perfil normativo federal (Brasil)
// Cada parâmetro registra a fonte e o status:
//   'confirmado' = conferido em pesquisa durante o desenvolvimento
//   'referencia' = valor de referência da norma citada, a conferir no documento oficial
//   'pratica'    = prática corrente de projeto (não é exigência federal); ajustável
// Todos os valores podem ser alterados pelo usuário no painel de Normas.

export const SOURCES = {
  DNER706: 'DNER/DNIT - Manual de Projeto Geométrico de Rodovias Rurais (IPR-706, 1999)',
  DNIT740: 'DNIT - Manual de Projeto Geométrico de Travessias Urbanas (IPR-740, 2010)',
  DNIT724: 'DNIT - Manual de Drenagem de Rodovias (IPR-724, 2006)',
  DNIT715: 'DNIT - Manual de Hidrologia Básica para Estruturas de Drenagem (IPR-715, 2005)',
  DNER81: 'DNER - Método de Projeto de Pavimentos Flexíveis (Souza, 1981), IPR-719 (2006)',
  CTB: 'Lei 9.503/1997 - Código de Trânsito Brasileiro, art. 61',
  MBST1: 'CONTRAN - Manual Brasileiro de Sinalização de Trânsito, Vol. I (Res. 180/2005)',
  MBST2: 'CONTRAN - Manual Brasileiro de Sinalização de Trânsito, Vol. II (Res. 243/2007)',
  MBST4: 'CONTRAN - Manual Brasileiro de Sinalização de Trânsito, Vol. IV (Res. 236/2007)',
  NBR9050: 'ABNT NBR 9050:2020 - Acessibilidade',
  NBR8890: 'ABNT NBR 8890 - Tubo de concreto para águas pluviais e esgoto',
  NBR13133: 'ABNT NBR 13133 - Execução de levantamento topográfico',
  L6766: 'Lei 6.766/1979 - Parcelamento do Solo Urbano (alterada pela Lei 13.913/2019)',
  L12651: 'Lei 12.651/2012 - Código Florestal, art. 4º',
  AASHTO: 'AASHTO - A Policy on Geometric Design of Highways and Streets (referência complementar)',
};

const V_LIST = [30, 40, 50, 60, 70, 80, 90, 100, 110, 120];

export const GEOMETRIC = {
  speeds: V_LIST,
  // coeficiente de atrito transversal máximo (DNER 1999)
  fmax: { values: [0.20, 0.18, 0.16, 0.15, 0.15, 0.14, 0.14, 0.13, 0.12, 0.11], src: 'DNER706', status: 'referencia' },
  // raios acima dos quais a superelevação é dispensável (DNER 1999)
  rNoSuper: { values: [450, 800, 1250, 1800, 2450, 3200, 4050, 5000, 5000, 5000], src: 'DNER706', status: 'confirmado' },
  // distância de visibilidade de parada (m)
  dvpMin: { values: [30, 45, 60, 75, 90, 110, 130, 155, 180, 205], src: 'DNER706', status: 'referencia' },
  dvpDes: { values: [30, 45, 65, 85, 110, 140, 175, 210, 255, 310], src: 'DNER706', status: 'referencia' },
  // K mínimo das curvas verticais: K = D²/412 (convexa, olho 1,10 m e obstáculo 0,15 m) e K = D²/(122 + 3,5 D) (côncava)
  kCrestMin: { values: [2, 5, 9, 14, 20, 29, 41, 58, 79, 102], src: 'DNER706', status: 'referencia' },
  kCrestDes: { values: [2, 5, 10, 18, 29, 48, 74, 107, 158, 233], src: 'DNER706', status: 'referencia' },
  kSagMin: { values: [4, 7, 11, 15, 19, 24, 29, 36, 43, 50], src: 'DNER706', status: 'referencia' },
  kSagDes: { values: [4, 7, 12, 17, 24, 32, 42, 52, 66, 80], src: 'DNER706', status: 'referencia' },
  // rampa relativa máxima entre borda e eixo na transição da superelevação (%)
  relGradeMax: { values: [0.75, 0.70, 0.65, 0.60, 0.55, 0.50, 0.47, 0.44, 0.41, 0.38], src: 'AASHTO', status: 'referencia' },
  // comprimento mínimo de curva vertical (m) = 0,6 · V
  lVertMinFactor: { value: 0.6, src: 'DNER706', status: 'referencia' },
  emaxAbsolute: { value: 0.12, src: 'DNER706', status: 'referencia' },
  minGrade: { value: 0.005, src: 'DNER706', status: 'referencia', note: 'Rampa mínima desejável em cortes e trechos com sarjeta (0,35% em casos excepcionais).' },
};

function interpBy(V, arr) {
  if (V <= V_LIST[0]) return arr[0];
  if (V >= V_LIST[V_LIST.length - 1]) return arr[arr.length - 1];
  for (let i = 1; i < V_LIST.length; i++) {
    if (V <= V_LIST[i]) {
      const t = (V - V_LIST[i - 1]) / (V_LIST[i] - V_LIST[i - 1]);
      return arr[i - 1] + t * (arr[i] - arr[i - 1]);
    }
  }
  return arr[arr.length - 1];
}

export const geo = {
  fmax: (V) => interpBy(V, GEOMETRIC.fmax.values),
  rNoSuper: (V) => interpBy(V, GEOMETRIC.rNoSuper.values),
  dvp: (V, desirable = false) => interpBy(V, desirable ? GEOMETRIC.dvpDes.values : GEOMETRIC.dvpMin.values),
  kCrest: (V, desirable = false) => interpBy(V, desirable ? GEOMETRIC.kCrestDes.values : GEOMETRIC.kCrestMin.values),
  kSag: (V, desirable = false) => interpBy(V, desirable ? GEOMETRIC.kSagDes.values : GEOMETRIC.kSagMin.values),
  relGradeMax: (V) => interpBy(V, GEOMETRIC.relGradeMax.values) / 100,
  lVertMin: (V) => GEOMETRIC.lVertMinFactor.value * V,
  /** Raio mínimo: R = V² / (127 (e + f)) */
  rMin: (V, emax) => (V * V) / (127 * (emax + interpBy(V, GEOMETRIC.fmax.values))),
  /**
   * Superelevação de projeto pelo critério do DNER: e = emax (2 Rmin/R − Rmin²/R²).
   * Abaixo do abaulamento usa o abaulamento (remove o declive adverso) e acima de R dispensável usa 0 (seção normal).
   */
  superelevation(V, R, emax, crown = 0.02) {
    if (!(R > 0)) return 0;
    if (R >= this.rNoSuper(V)) return 0;
    const rmin = this.rMin(V, emax);
    if (R <= rmin) return emax;
    const e = emax * ((2 * rmin) / R - (rmin * rmin) / (R * R));
    return Math.max(e, crown);
  },
};

/** Velocidades máximas regulamentares onde não houver sinalização (CTB, art. 61). */
export const CTB_SPEEDS = {
  transito_rapido: { label: 'Via de trânsito rápido', V: 80 },
  arterial: { label: 'Via arterial', V: 60 },
  coletora: { label: 'Via coletora', V: 40 },
  local: { label: 'Via local', V: 30 },
  rodovia_dupla: { label: 'Rodovia de pista dupla', V: 110 },
  rodovia_simples: { label: 'Rodovia de pista simples', V: 100 },
  estrada: { label: 'Estrada (não pavimentada)', V: 60 },
  src: 'CTB', status: 'confirmado',
};

/**
 * Classes de via com parâmetros padrão. Valores de largura e rampa são referências
 * do DNIT (IPR-706 e IPR-740) e podem ser ajustados no projeto.
 */
export const ROAD_CLASSES = {
  local: { label: 'Via urbana local', group: 'urbana', V: 30, lane: 3.00, lanes: [1, 1], shoulder: 0, emax: 0.04, maxGrade: 0.15, crown: 0.02, superelevation: false, sidewalk: 2.50, gutter: 0.30, curb: 0.15, median: 0 },
  coletora: { label: 'Via urbana coletora', group: 'urbana', V: 40, lane: 3.30, lanes: [1, 1], shoulder: 0, emax: 0.04, maxGrade: 0.12, crown: 0.02, superelevation: false, sidewalk: 3.00, gutter: 0.30, curb: 0.15, median: 0 },
  arterial: { label: 'Via urbana arterial', group: 'urbana', V: 60, lane: 3.50, lanes: [2, 2], shoulder: 0, emax: 0.06, maxGrade: 0.08, crown: 0.02, superelevation: true, sidewalk: 3.00, gutter: 0.40, curb: 0.15, median: 2.00 },
  transito_rapido: { label: 'Via urbana de trânsito rápido', group: 'urbana', V: 80, lane: 3.60, lanes: [2, 2], shoulder: 2.50, emax: 0.08, maxGrade: 0.06, crown: 0.02, superelevation: true, sidewalk: 0, gutter: 0, curb: 0, median: 3.00 },
  rodovia_I: { label: 'Rodovia classe I', group: 'rodovia', V: 80, lane: 3.60, lanes: [1, 1], shoulder: 2.50, emax: 0.10, maxGrade: 0.045, crown: 0.02, superelevation: true, sidewalk: 0, gutter: 0, curb: 0, median: 0 },
  rodovia_II: { label: 'Rodovia classe II', group: 'rodovia', V: 70, lane: 3.50, lanes: [1, 1], shoulder: 2.50, emax: 0.08, maxGrade: 0.05, crown: 0.02, superelevation: true, sidewalk: 0, gutter: 0, curb: 0, median: 0 },
  rodovia_III: { label: 'Rodovia classe III', group: 'rodovia', V: 60, lane: 3.30, lanes: [1, 1], shoulder: 2.00, emax: 0.08, maxGrade: 0.06, crown: 0.02, superelevation: true, sidewalk: 0, gutter: 0, curb: 0, median: 0 },
  rodovia_IV: { label: 'Rodovia classe IV', group: 'rodovia', V: 40, lane: 3.00, lanes: [1, 1], shoulder: 1.00, emax: 0.08, maxGrade: 0.08, crown: 0.025, superelevation: true, sidewalk: 0, gutter: 0, curb: 0, median: 0 },
};
export const ROAD_CLASSES_META = { src: 'DNIT740', status: 'referencia', note: 'Larguras e rampas máximas são valores de referência por classe (DNIT IPR-706/IPR-740). Rampas de rodovias para relevo ondulado.' };

/** Rampas máximas por classe e relevo (DNER 1999): [plano, ondulado, montanhoso] */
export const MAX_GRADES_RURAL = {
  'Classe 0': [0.03, 0.04, 0.05], 'Classe I': [0.03, 0.045, 0.06], 'Classe II': [0.03, 0.05, 0.07],
  'Classe III': [0.04, 0.06, 0.08], 'Classe IV-A': [0.04, 0.06, 0.08], 'Classe IV-B': [0.06, 0.08, 0.10],
  src: 'DNER706', status: 'referencia',
};

export const CROSS_SECTION = {
  crownAsphalt: { value: 0.02, src: 'DNER706', status: 'referencia', label: 'Abaulamento de pista asfáltica' },
  shoulderSlope: { value: 0.05, src: 'DNER706', status: 'referencia', label: 'Declividade de acostamento' },
  sidewalkFreeMin: { value: 1.20, src: 'NBR9050', status: 'confirmado', label: 'Faixa livre mínima do passeio (m)' },
  sidewalkServiceMin: { value: 0.70, src: 'NBR9050', status: 'confirmado', label: 'Faixa de serviço mínima (m)' },
  sidewalkCrossMax: { value: 0.03, src: 'NBR9050', status: 'confirmado', label: 'Inclinação transversal máxima da faixa livre' },
  curbRampMax: { value: 0.0833, src: 'NBR9050', status: 'confirmado', label: 'Inclinação máxima do rebaixamento de calçada' },
  curbRampWidthMin: { value: 1.50, src: 'NBR9050', status: 'confirmado', label: 'Largura mínima do rebaixamento (m)' },
  cutSlope: { value: 1.0, src: 'DNER706', status: 'pratica', label: 'Talude de corte (H:V)' },
  fillSlope: { value: 1.5, src: 'DNER706', status: 'pratica', label: 'Talude de aterro (H:V)' },
};

export const DRAINAGE = {
  manning: {
    'Tubo de concreto': 0.013, 'Sarjeta de concreto': 0.016, 'Pavimento asfáltico': 0.016,
    'Canal em terra': 0.025, 'Canal gramado': 0.035, src: 'DNIT724', status: 'pratica',
  },
  runoffC: {
    'Pavimento asfáltico': 0.90, 'Concreto': 0.90, 'Passeio': 0.85, 'Telhados': 0.90,
    'Lotes residenciais': 0.60, 'Gramados': 0.25, 'Áreas verdes': 0.20, 'Solo exposto': 0.50,
    src: 'DNIT715', status: 'pratica',
  },
  pipeDiameters: { values: [0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.90, 1.00, 1.10, 1.20, 1.50, 2.00], src: 'NBR8890', status: 'referencia' },
  pipeMinDiameter: { value: 0.40, src: 'DNIT724', status: 'pratica', label: 'Diâmetro mínimo de galeria (m)' },
  pipeMaxDepthRatio: { value: 0.85, src: 'DNIT724', status: 'pratica', label: 'Lâmina máxima y/D' },
  pipeVmin: { value: 0.75, src: 'DNIT724', status: 'pratica', label: 'Velocidade mínima (m/s)' },
  pipeVmax: { value: 5.0, src: 'DNIT724', status: 'pratica', label: 'Velocidade máxima em tubo de concreto (m/s)' },
  minCover: { value: 1.0, src: 'DNIT724', status: 'pratica', label: 'Recobrimento mínimo da galeria (m)' },
  gutterMaxDepth: { value: 0.13, src: 'DNIT724', status: 'confirmado', label: 'Lâmina máxima na sarjeta para guia de 15 cm (m)' },
  gutterVmax: { value: 3.0, src: 'DNIT724', status: 'pratica', label: 'Velocidade máxima na sarjeta (m/s)' },
  tcMin: { value: 10, src: 'DNIT715', status: 'pratica', label: 'Tempo de concentração mínimo (min)' },
  returnPeriods: { sarjeta: 10, galeria: 10, bueiro: 25, src: 'DNIT715', status: 'pratica' },
  rationalMaxArea: { value: 3.0, src: 'DNIT715', status: 'pratica', label: 'Área máxima para o método racional (km²)' },
};

export const PAVEMENT = {
  // H_t = 77,67 · N^0,0482 · CBR^-0,598 (cm)
  formula: { a: 77.67, b: 0.0482, c: -0.598, src: 'DNER81', status: 'confirmado' },
  coefficients: {
    'Concreto betuminoso (CBUQ)': 2.0, 'Pré-misturado a quente': 1.7, 'Pré-misturado a frio denso': 1.4,
    'Tratamento superficial': 1.2, 'Base granular (BGS/BGTC)': 1.0, 'Solo-cimento (> 45 kgf/cm²)': 1.7,
    'Solo-cimento (28-45 kgf/cm²)': 1.4, 'Sub-base granular': 1.0, 'Reforço do subleito': 1.0,
    src: 'DNER81', status: 'referencia',
  },
  // espessura mínima de revestimento por faixa de N
  minSurface: [
    { maxN: 1e6, label: 'Tratamento superficial', cm: 0 },
    { maxN: 5e6, label: 'Concreto betuminoso', cm: 5.0 },
    { maxN: 1e7, label: 'Concreto betuminoso', cm: 7.5 },
    { maxN: 5e7, label: 'Concreto betuminoso', cm: 10.0 },
    { maxN: Infinity, label: 'Concreto betuminoso', cm: 12.5 },
  ],
  minSurfaceMeta: { src: 'DNER81', status: 'confirmado' },
  subgradeMinCBR: { value: 2, src: 'DNER81', status: 'confirmado', note: 'CBR < 2%: substituir o subleito (mínimo 1 m) por material com CBR ≥ 2%.' },
  note: 'O DNIT adota o método mecanístico-empírico MeDiNa para rodovias federais. O método DNER/1981 permanece como referência empírica de pré-dimensionamento.',
};

export const SIGNAGE = {
  lineWidth: (V) => (V >= 80 ? 0.15 : 0.10),
  lineWidthMeta: { src: 'MBST4', status: 'confirmado', note: 'Linhas longitudinais: 0,10 m para V < 80 km/h e 0,15 m para V ≥ 80 km/h.' },
  // cadência das linhas seccionadas (traço, espaço) em m
  dash: (V) => (V <= 60 ? { dash: 2, gap: 4 } : { dash: 4, gap: 12 }),
  dashMeta: { src: 'MBST4', status: 'referencia', note: 'Cadência traço:espaço de 1:2 em vias até 60 km/h e 1:3 acima. Conferir tabela do Vol. IV.' },
  crosswalk: { barWidth: 0.40, barGap: 0.40, length: 4.0, src: 'MBST4', status: 'referencia' },
  stopLine: { width: 0.40, src: 'MBST4', status: 'referencia' },
  lineTypes: {
    LFO1: { code: 'LFO-1', label: 'Linha simples contínua amarela (fluxos opostos)', color: 'amarela', dashed: false, double: false },
    LFO2: { code: 'LFO-2', label: 'Linha simples seccionada amarela (fluxos opostos, ultrapassagem permitida)', color: 'amarela', dashed: true, double: false },
    LFO3: { code: 'LFO-3', label: 'Linha dupla contínua amarela (fluxos opostos)', color: 'amarela', dashed: false, double: true },
    LMS1: { code: 'LMS-1', label: 'Linha simples contínua branca (mesmo sentido)', color: 'branca', dashed: false, double: false },
    LMS2: { code: 'LMS-2', label: 'Linha simples seccionada branca (mesmo sentido)', color: 'branca', dashed: true, double: false },
    LBO: { code: 'LBO', label: 'Linha de bordo contínua branca', color: 'branca', dashed: false, double: false },
  },
  // LFO-3 indicada para pista de sentido duplo com largura ≥ 7,00 m e/ou volume elevado
  lfo3MinWidth: { value: 7.0, src: 'MBST4', status: 'confirmado' },
};

/** Dimensões de placas por forma (m) — [urbana, rodovia]. */
export const SIGN_SIZES = {
  octogono: { label: 'Octógono (R-1)', urban: 0.35, rural: 0.50, minUrban: 0.25, minRural: 0.40, src: 'MBST1', status: 'confirmado', dim: 'lado' },
  circulo: { label: 'Circular (regulamentação)', urban: 0.50, rural: 0.75, minUrban: 0.40, minRural: 0.75, src: 'MBST1', status: 'referencia', dim: 'diâmetro' },
  triangulo: { label: 'Triangular (R-2)', urban: 0.75, rural: 0.90, minUrban: 0.75, minRural: 0.90, src: 'MBST1', status: 'referencia', dim: 'lado' },
  losango: { label: 'Quadrada em losango (advertência)', urban: 0.50, rural: 0.60, minUrban: 0.45, minRural: 0.60, src: 'MBST2', status: 'referencia', dim: 'lado' },
  retangulo: { label: 'Retangular (indicação)', urban: 1.00, rural: 2.00, minUrban: 0.50, minRural: 1.00, src: 'MBST1', status: 'pratica', dim: 'largura' },
};

export const SIGN_CATALOG = [
  { code: 'R-1', name: 'Parada obrigatória', shape: 'octogono' },
  { code: 'R-2', name: 'Dê a preferência', shape: 'triangulo' },
  { code: 'R-3', name: 'Sentido proibido', shape: 'circulo' },
  { code: 'R-4a', name: 'Proibido virar à esquerda', shape: 'circulo' },
  { code: 'R-4b', name: 'Proibido virar à direita', shape: 'circulo' },
  { code: 'R-5a', name: 'Proibido retornar à esquerda', shape: 'circulo' },
  { code: 'R-6a', name: 'Proibido estacionar', shape: 'circulo' },
  { code: 'R-6b', name: 'Estacionamento regulamentado', shape: 'circulo' },
  { code: 'R-6c', name: 'Proibido parar e estacionar', shape: 'circulo' },
  { code: 'R-7', name: 'Proibido ultrapassar', shape: 'circulo' },
  { code: 'R-19', name: 'Velocidade máxima permitida', shape: 'circulo', param: 'km/h' },
  { code: 'R-24a', name: 'Sentido de circulação da via', shape: 'circulo' },
  { code: 'R-25a', name: 'Vire à esquerda', shape: 'circulo' },
  { code: 'R-26', name: 'Siga em frente', shape: 'circulo' },
  { code: 'R-28', name: 'Duplo sentido de circulação', shape: 'circulo' },
  { code: 'R-33', name: 'Sentido de circulação na rotatória', shape: 'circulo' },
  { code: 'R-34', name: 'Circulação exclusiva de bicicletas', shape: 'circulo' },
  { code: 'A-1a', name: 'Curva acentuada à esquerda', shape: 'losango' },
  { code: 'A-1b', name: 'Curva acentuada à direita', shape: 'losango' },
  { code: 'A-2a', name: 'Curva à esquerda', shape: 'losango' },
  { code: 'A-2b', name: 'Curva à direita', shape: 'losango' },
  { code: 'A-6', name: 'Cruzamento de vias', shape: 'losango' },
  { code: 'A-7a', name: 'Via lateral à esquerda', shape: 'losango' },
  { code: 'A-7b', name: 'Via lateral à direita', shape: 'losango' },
  { code: 'A-12', name: 'Interseção em círculo', shape: 'losango' },
  { code: 'A-14', name: 'Semáforo à frente', shape: 'losango' },
  { code: 'A-15', name: 'Parada obrigatória à frente', shape: 'losango' },
  { code: 'A-18', name: 'Saliência ou lombada', shape: 'losango' },
  { code: 'A-20a', name: 'Declive acentuado', shape: 'losango' },
  { code: 'A-21a', name: 'Estreitamento de pista ao centro', shape: 'losango' },
  { code: 'A-24', name: 'Obras', shape: 'losango' },
  { code: 'A-30a', name: 'Trânsito de ciclistas', shape: 'losango' },
  { code: 'A-32b', name: 'Passagem sinalizada de pedestres', shape: 'losango' },
  { code: 'A-33b', name: 'Passagem sinalizada de escolares', shape: 'losango' },
  { code: 'I-1', name: 'Placa de identificação de via', shape: 'retangulo' },
];

export const LAND_USE = {
  minLotArea: { value: 125, src: 'L6766', status: 'confirmado', label: 'Área mínima de lote (m²)', note: 'Art. 4º, II, salvo legislação estadual/municipal mais restritiva ou interesse social.' },
  minLotFront: { value: 5, src: 'L6766', status: 'confirmado', label: 'Frente mínima de lote (m)' },
  nonBuildableRoad: { value: 15, src: 'L6766', status: 'confirmado', label: 'Faixa não edificável ao longo de rodovias e ferrovias (m, cada lado)', note: 'Pode ser reduzida por lei municipal até 5 m (Lei 13.913/2019).' },
  // APP de cursos d'água (Código Florestal, art. 4º, I): largura do curso -> faixa marginal
  appRivers: { table: [[10, 30], [50, 50], [200, 100], [600, 200], [Infinity, 500]], src: 'L12651', status: 'referencia', label: 'APP de cursos d’água (m)' },
  appSpring: { value: 50, src: 'L12651', status: 'referencia', label: 'APP de nascentes (raio, m)' },
  appUrbanLake: { value: 30, src: 'L12651', status: 'referencia', label: 'APP de lagos naturais em zona urbana (m)' },
};

export function appWidthForRiver(widthM) {
  for (const [w, app] of LAND_USE.appRivers.table) if (widthM < w) return app;
  return 500;
}

export const NORM_PROFILE = {
  id: 'brasil-federal-2026',
  label: 'Brasil - normas e leis federais',
  sources: SOURCES,
  geometric: GEOMETRIC,
  roadClasses: ROAD_CLASSES,
  crossSection: CROSS_SECTION,
  drainage: DRAINAGE,
  pavement: PAVEMENT,
  signage: SIGNAGE,
  signSizes: SIGN_SIZES,
  landUse: LAND_USE,
};

/** Lista plana dos parâmetros para exibição (painel de normas e memorial). */
export function normTable() {
  const rows = [];
  const push = (grupo, nome, valor, meta) => rows.push({ grupo, nome, valor, fonte: SOURCES[meta.src] || meta.src, status: meta.status, nota: meta.note || '' });
  push('Geometria', 'Atrito transversal máximo f (30 a 120 km/h)', GEOMETRIC.fmax.values.join(' / '), GEOMETRIC.fmax);
  push('Geometria', 'Raio com superelevação dispensável (m)', GEOMETRIC.rNoSuper.values.slice(0, 8).join(' / '), GEOMETRIC.rNoSuper);
  push('Geometria', 'Distância de visibilidade de parada mínima (m)', GEOMETRIC.dvpMin.values.join(' / '), GEOMETRIC.dvpMin);
  push('Geometria', 'K mínimo convexa', GEOMETRIC.kCrestMin.values.join(' / '), GEOMETRIC.kCrestMin);
  push('Geometria', 'K mínimo côncava', GEOMETRIC.kSagMin.values.join(' / '), GEOMETRIC.kSagMin);
  push('Geometria', 'Rampa relativa máxima borda/eixo (%)', GEOMETRIC.relGradeMax.values.join(' / '), GEOMETRIC.relGradeMax);
  push('Geometria', 'Comprimento mínimo de curva vertical', 'L ≥ 0,6·V', GEOMETRIC.lVertMinFactor);
  push('Geometria', 'Rampa mínima', '0,5%', GEOMETRIC.minGrade);
  push('Trânsito', 'Velocidades máximas (trânsito rápido / arterial / coletora / local)', '80 / 60 / 40 / 30 km/h', CTB_SPEEDS);
  for (const v of Object.values(CROSS_SECTION)) push('Seção transversal', v.label, String(v.value), v);
  push('Drenagem', 'Lâmina máxima na sarjeta (guia 15 cm)', '0,13 m', DRAINAGE.gutterMaxDepth);
  push('Drenagem', 'Diâmetros comerciais de tubos (m)', DRAINAGE.pipeDiameters.values.join(' / '), DRAINAGE.pipeDiameters);
  for (const k of ['pipeMinDiameter', 'pipeMaxDepthRatio', 'pipeVmin', 'pipeVmax', 'minCover', 'gutterVmax', 'tcMin', 'rationalMaxArea']) push('Drenagem', DRAINAGE[k].label, String(DRAINAGE[k].value), DRAINAGE[k]);
  push('Pavimentação', 'Espessura total (DNER/1981)', 'Ht = 77,67·N^0,0482·CBR^-0,598 (cm)', PAVEMENT.formula);
  push('Pavimentação', 'Revestimento mínimo por N', '≤10⁶: TS; ≤5·10⁶: 5 cm; ≤10⁷: 7,5 cm; ≤5·10⁷: 10 cm; >5·10⁷: 12,5 cm', PAVEMENT.minSurfaceMeta);
  push('Sinalização', 'Largura de linhas longitudinais', '0,10 m (V < 80) / 0,15 m (V ≥ 80)', SIGNAGE.lineWidthMeta);
  push('Sinalização', 'Cadência de linhas seccionadas', '2/4 m (V ≤ 60) / 4/12 m (V > 60)', SIGNAGE.dashMeta);
  push('Sinalização', 'Placa R-1 (lado, urbana / rodovia)', '0,35 / 0,50 m (mín. 0,25 / 0,40 m)', SIGN_SIZES.octogono);
  for (const v of [LAND_USE.minLotArea, LAND_USE.minLotFront, LAND_USE.nonBuildableRoad, LAND_USE.appSpring, LAND_USE.appUrbanLake]) push('Parcelamento', v.label, String(v.value), v);
  return rows;
}
