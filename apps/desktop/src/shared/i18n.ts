import type { Language } from "./types";

/** Every user-visible string in the orb and the settings window. */
export interface Strings {
  appName: string;
  session: string;
  week: string;
  weekOpus: string;
  sessionHint: string;
  weekHint: string;
  used: string;
  resetsIn: string;
  resetsOn: string;
  updated: string;
  never: string;
  noCredentials: string;
  setupHint: string;
  loadFailed: string;
  loading: string;
  refresh: string;
  openSettings: string;
  showOrb: string;
  hideOrb: string;
  quit: string;
  noUsageYet: string;

  settingsTitle: string;
  tabUsage: string;
  tabAppearance: string;
  tabBehavior: string;
  tabAbout: string;

  overview: string;
  peakThisWeek: string;
  peakInPeriod: string;
  last7Days: string;
  viewWeek: string;
  viewMonth: string;
  prevPeriod: string;
  nextPeriod: string;
  currentPeriod: string;
  account: string;
  source: string;
  sourceHost: string;
  sourceWsl: string;
  sourceAuto: string;
  noHistoryYet: string;
  noHistoryPeriod: string;
  chartHover: string;
  peakLabel: string;
  readings: string;
  burnRateTitle: string;
  burnRateHint: string;
  usageSteady: string;
  exhaustsNow: string;
  exhaustsIn: string;
  exhaustsOn: string;
  weeklyPaceTitle: string;
  weeklyPaceHint: string;
  paceUnder: string;
  paceOn: string;
  paceOver: string;
  paceExpectedNow: string;
  paceUnavailable: string;
  paceMeterExplain: string;
  pointsUnit: string;
  projectedAtReset: string;
  projectedAtResetExplain: string;
  needsMoreReadings: string;
  dailyBudget: string;
  dailyBudgetHint: string;
  dailyBudgetExplain: string;
  budgetUntilReset: string;
  budgetUntilResetExplain: string;
  today: string;
  todayExplain: string;
  ofWord: string;
  expectedPerDay: string;
  dailyAverage: string;
  dailyAverageExplain: string;
  completeDaysHint: string;
  vsPreviousWeek: string;
  dailyUsageTitle: string;
  expectedLine: string;
  noReadings: string;
  sessionsLastWeek: string;
  sessionsNearLimit: string;

  modelsTitle: string;
  modelsHint: string;
  modelsThisWeek: string;
  modelsSessions: string;
  modelsCurrent: string;
  modelsOfUsage: string;
  modelsOfSessionLimit: string;
  modelsOfWeekLimit: string;
  modelsReplies: string;
  modelsNoActivity: string;
  modelsNoActivityWindow: string;
  modelsNoLogs: string;
  modelsEstimateExplain: string;
  modelsNoPercent: string;

  floatingOrb: string;
  floatingOrbHint: string;
  enableOrb: string;
  hideOrbSetting: string;
  hideOrbHint: string;
  orbSize: string;
  sizeSmall: string;
  sizeMedium: string;
  sizeLarge: string;
  opacity: string;
  opacityHint: string;
  showPercent: string;
  showPercentHint: string;
  alwaysOnTop: string;
  alwaysOnTopHint: string;
  lockPosition: string;
  lockPositionHint: string;
  resetPosition: string;
  resetPositionHint: string;

  ringColor: string;
  ringSection: string;
  updatesSection: string;
  systemSection: string;
  colorDynamic: string;
  colorDynamicHint: string;
  colorFixed: string;
  colorFixedHint: string;
  customColor: string;
  ringMetric: string;
  ringMetricHint: string;
  metricSession: string;
  metricWeek: string;
  metricHighest: string;

  refreshInterval: string;
  refreshIntervalHint: string;
  minutes: string;
  notifications: string;
  notificationsHint: string;
  thresholds: string;
  thresholdsHint: string;
  launchAtLogin: string;
  launchAtLoginHint: string;
  launchAtLoginUnavailable: string;
  language: string;
  languageHint: string;

  version: string;
  platform: string;
  dataFolder: string;
  aboutBody: string;
  privacyNote: string;
  quitCircle: string;
  quitHint: string;

  colorOrange: string;
  colorGreen: string;
  colorBlue: string;
  colorPurple: string;
  colorPink: string;
  colorYellow: string;
  colorTeal: string;
  colorWhite: string;
}

const en: Strings = {
  appName: "Circle",
  session: "Session",
  week: "Week",
  weekOpus: "Week (Opus)",
  sessionHint: "Rolling 5-hour window",
  weekHint: "Rolling 7-day window",
  used: "used",
  resetsIn: "resets in",
  resetsOn: "resets",
  updated: "Updated",
  never: "never",
  noCredentials: "Claude Code is not signed in",
  setupHint: "Run `claude` and sign in, then refresh Circle.",
  loadFailed: "Could not load usage",
  loading: "Loading usage…",
  refresh: "Refresh",
  openSettings: "Open settings",
  showOrb: "Show orb",
  hideOrb: "Hide orb",
  quit: "Quit",
  noUsageYet: "No usage data yet",

  settingsTitle: "Circle settings",
  tabUsage: "Usage",
  tabAppearance: "Appearance",
  tabBehavior: "Behaviour",
  tabAbout: "About",

  overview: "Overview",
  peakThisWeek: "Peak in the last 7 days",
  peakInPeriod: "Peak in this period",
  last7Days: "Usage trend",
  viewWeek: "Week",
  viewMonth: "Month",
  prevPeriod: "Previous period",
  nextPeriod: "Next period",
  currentPeriod: "Back to today",
  account: "Account",
  source: "Credential source",
  sourceHost: "Windows",
  sourceWsl: "WSL",
  sourceAuto: "Automatic",
  noHistoryYet: "History fills in as Circle keeps reading your usage.",
  noHistoryPeriod: "No readings in this period.",
  chartHover: "Hover the chart for the exact reading.",
  peakLabel: "Peak",
  readings: "readings",
  burnRateTitle: "At this pace",
  burnRateHint: "Based on how fast you've been using each window recently.",
  usageSteady: "On track — no window is projected to run out before it resets.",
  exhaustsNow: "Already at the limit",
  exhaustsIn: "runs out in",
  exhaustsOn: "runs out around",

  weeklyPaceTitle: "Weekly pace",
  weeklyPaceHint: "Your weekly usage compared with an even spread across the 7-day window.",
  paceUnder: "Below expected",
  paceOn: "Within expected",
  paceOver: "Above expected",
  paceExpectedNow: "expected by now",
  paceUnavailable: "Pace shows up once Anthropic reports when your weekly window resets.",
  paceMeterExplain: "How much of your weekly quota is used versus how much an even pace would have used by now. Above the marker means you're burning through it faster than a steady rate would.",
  pointsUnit: "pts",
  projectedAtReset: "Projected at reset",
  projectedAtResetExplain: "Where your usage would land at the end of the week if you keep going at your current pace.",
  needsMoreReadings: "Needs a few more readings",
  dailyBudget: "Available per day",
  dailyBudgetHint: "to spread evenly until the reset",
  dailyBudgetExplain: "How much you could use each remaining day, on average, without exceeding your weekly quota.",
  budgetUntilReset: "Available until reset",
  budgetUntilResetExplain: "How much quota is left to use before the weekly window resets.",
  today: "Today",
  todayExplain: "How much of your weekly quota you've used so far today.",
  ofWord: "of",
  expectedPerDay: "expected per day",
  dailyAverage: "Daily average",
  dailyAverageExplain: "Your average daily usage over the last 7 days.",
  completeDaysHint: "complete days in the last week",
  vsPreviousWeek: "vs the previous 7 days",
  dailyUsageTitle: "Weekly usage per day",
  expectedLine: "Expected per day",
  noReadings: "no readings",
  sessionsLastWeek: "Sessions in the last 7 days",
  sessionsNearLimit: "near the limit",

  modelsTitle: "Models",
  modelsHint: "Which models used your limits. Each window's usage is split by the models' share of what the same work would cost on the API.",
  modelsThisWeek: "This week",
  modelsSessions: "Sessions",
  modelsCurrent: "Now",
  modelsOfUsage: "of usage",
  modelsOfSessionLimit: "of the session limit",
  modelsOfWeekLimit: "of the weekly limit",
  modelsReplies: "replies",
  modelsNoActivity: "No Claude Code activity in the last 7 days.",
  modelsNoActivityWindow: "No Claude Code replies logged in this window — the usage came from claude.ai or another computer.",
  modelsNoLogs: "Claude Code's session logs weren't found for this source, so Circle can't tell which models were used.",
  modelsEstimateExplain: "An estimate: Circle splits the usage Anthropic reports between the models Claude Code logged on this computer, weighted by API price. Usage from claude.ai or other computers isn't in those logs.",
  modelsNoPercent: "Circle has no reading from this window, so only each model's share is known.",

  floatingOrb: "Floating orb",
  floatingOrbHint: "The circle that stays on top of your desktop.",
  enableOrb: "Enable the floating orb",
  hideOrbSetting: "Hide the orb",
  hideOrbHint: "Bring it back from the Circle icon in the taskbar's hidden icons.",
  orbSize: "Orb size",
  sizeSmall: "Small",
  sizeMedium: "Medium",
  sizeLarge: "Large",
  opacity: "Idle opacity",
  opacityHint: "The orb returns to full opacity while you hover it.",
  showPercent: "Show the percentage inside the orb",
  showPercentHint: "Turn off for a ring-only look.",
  alwaysOnTop: "Keep the orb above other windows",
  alwaysOnTopHint: "Turn off to let other windows cover it.",
  lockPosition: "Lock the orb position",
  lockPositionHint: "Stops the orb from moving when you drag it.",
  resetPosition: "Reset position",
  resetPositionHint: "Move the orb back to the bottom-right corner.",

  ringColor: "Ring colour",
  ringSection: "Ring",
  updatesSection: "Refresh and alerts",
  systemSection: "System",
  colorDynamic: "Follow usage",
  colorDynamicHint: "Green, yellow, orange, then red as credit runs down.",
  colorFixed: "Fixed colour",
  colorFixedHint: "Always draw the ring in the colour you pick.",
  customColor: "Custom",
  ringMetric: "Ring metric",
  ringMetricHint: "Which window the outer ring and the percentage follow.",
  metricSession: "Session (5 hours)",
  metricWeek: "Week (7 days)",
  metricHighest: "Whichever is higher",

  refreshInterval: "Refresh every",
  refreshIntervalHint: "How often Circle asks Anthropic for new usage numbers.",
  minutes: "min",
  notifications: "Usage notifications",
  notificationsHint: "Warn me when a window crosses a threshold.",
  thresholds: "Thresholds",
  thresholdsHint: "Comma-separated percentages, for example 75, 90.",
  launchAtLogin: "Start Circle when I sign in",
  launchAtLoginHint: "Circle starts minimised in the tray.",
  launchAtLoginUnavailable: "Not available on this platform.",
  language: "Language",
  languageHint: "Applies to the orb and this window.",

  version: "Version",
  platform: "Platform",
  dataFolder: "Data folder",
  aboutBody: "Circle reads the Claude Code credentials already on this machine and asks Anthropic for your current usage. Inspired by Metria.",
  privacyNote: "Credentials never leave your computer: they are read at runtime and only used to call Anthropic's usage endpoint. For the model breakdown Circle also reads Claude Code's local session logs, keeping only model names, timestamps and token counts — never what you wrote.",
  quitCircle: "Quit Circle",
  quitHint: "Closes the orb and the tray icon.",

  colorOrange: "Orange",
  colorGreen: "Green",
  colorBlue: "Blue",
  colorPurple: "Purple",
  colorPink: "Pink",
  colorYellow: "Yellow",
  colorTeal: "Teal",
  colorWhite: "White"
};

const ptBR: Strings = {
  appName: "Circle",
  session: "Sessão",
  week: "Semana",
  weekOpus: "Semana (Opus)",
  sessionHint: "Janela contínua de 5 horas",
  weekHint: "Janela contínua de 7 dias",
  used: "usado",
  resetsIn: "renova em",
  resetsOn: "renova",
  updated: "Atualizado",
  never: "nunca",
  noCredentials: "O Claude Code não está conectado",
  setupHint: "Execute `claude`, faça login e atualize o Circle.",
  loadFailed: "Não foi possível carregar o uso",
  loading: "Carregando uso…",
  refresh: "Atualizar",
  openSettings: "Abrir configurações",
  showOrb: "Mostrar o círculo",
  hideOrb: "Ocultar o círculo",
  quit: "Sair",
  noUsageYet: "Ainda sem dados de uso",

  settingsTitle: "Configurações do Circle",
  tabUsage: "Uso",
  tabAppearance: "Aparência",
  tabBehavior: "Comportamento",
  tabAbout: "Sobre",

  overview: "Visão geral",
  peakThisWeek: "Pico nos últimos 7 dias",
  peakInPeriod: "Pico neste período",
  last7Days: "Tendência de uso",
  viewWeek: "Semana",
  viewMonth: "Mês",
  prevPeriod: "Período anterior",
  nextPeriod: "Próximo período",
  currentPeriod: "Voltar para hoje",
  account: "Conta",
  source: "Origem das credenciais",
  sourceHost: "Windows",
  sourceWsl: "WSL",
  sourceAuto: "Automática",
  noHistoryYet: "O histórico é preenchido conforme o Circle lê seu uso.",
  noHistoryPeriod: "Sem leituras neste período.",
  chartHover: "Passe o mouse no gráfico para ver a leitura exata.",
  peakLabel: "Pico",
  readings: "leituras",
  burnRateTitle: "No ritmo atual",
  burnRateHint: "Baseado na velocidade recente de uso de cada janela.",
  usageSteady: "Sob controle — nenhuma janela deve esgotar antes de renovar.",
  exhaustsNow: "Já no limite",
  exhaustsIn: "esgota em",
  exhaustsOn: "esgota por volta de",

  weeklyPaceTitle: "Ritmo semanal",
  weeklyPaceHint: "Seu uso semanal comparado com uma distribuição uniforme ao longo dos 7 dias.",
  paceUnder: "Abaixo do previsto",
  paceOn: "Dentro do previsto",
  paceOver: "Acima do previsto",
  paceExpectedNow: "previsto até agora",
  paceUnavailable: "O ritmo aparece quando a Anthropic informar a renovação da janela semanal.",
  paceMeterExplain: "Quanto da sua cota semanal já foi usado em comparação com o que um ritmo uniforme já teria usado até agora. Acima do marcador significa que você está gastando mais rápido que um ritmo constante.",
  pointsUnit: "p.p.",
  projectedAtReset: "Previsão na renovação",
  projectedAtResetExplain: "Onde seu uso chegaria no fim da semana se você continuar no ritmo atual.",
  needsMoreReadings: "Precisa de mais leituras",
  dailyBudget: "Disponível por dia",
  dailyBudgetHint: "para distribuir até a renovação",
  dailyBudgetExplain: "Quanto você poderia usar em média por cada dia restante sem estourar a cota semanal.",
  budgetUntilReset: "Disponível até renovar",
  budgetUntilResetExplain: "Quanto de cota ainda resta até a janela semanal renovar.",
  today: "Hoje",
  todayExplain: "Quanto da sua cota semanal você já usou hoje.",
  ofWord: "de",
  expectedPerDay: "previstos por dia",
  dailyAverage: "Média diária",
  dailyAverageExplain: "Sua média de uso diário nos últimos 7 dias.",
  completeDaysHint: "dias completos da última semana",
  vsPreviousWeek: "vs. os 7 dias anteriores",
  dailyUsageTitle: "Uso semanal por dia",
  expectedLine: "Previsto por dia",
  noReadings: "sem leituras",
  sessionsLastWeek: "Sessões nos últimos 7 dias",
  sessionsNearLimit: "perto do limite",

  modelsTitle: "Modelos",
  modelsHint: "Quais modelos consumiram seus limites. O uso de cada janela é dividido pela fatia de cada modelo no que o mesmo trabalho custaria na API.",
  modelsThisWeek: "Esta semana",
  modelsSessions: "Sessões",
  modelsCurrent: "Agora",
  modelsOfUsage: "do uso",
  modelsOfSessionLimit: "do limite da sessão",
  modelsOfWeekLimit: "do limite semanal",
  modelsReplies: "respostas",
  modelsNoActivity: "Nenhuma atividade do Claude Code nos últimos 7 dias.",
  modelsNoActivityWindow: "Nenhuma resposta do Claude Code registrada nesta janela — o uso veio do claude.ai ou de outro computador.",
  modelsNoLogs: "Os registros de sessão do Claude Code não foram encontrados para esta origem, então o Circle não consegue dizer quais modelos foram usados.",
  modelsEstimateExplain: "Uma estimativa: o Circle divide o uso informado pela Anthropic entre os modelos que o Claude Code registrou neste computador, ponderado pelo preço da API. Uso do claude.ai ou de outros computadores não aparece nesses registros.",
  modelsNoPercent: "O Circle não tem leitura desta janela, então só a fatia de cada modelo é conhecida.",

  floatingOrb: "Círculo flutuante",
  floatingOrbHint: "O círculo que fica sobre a sua área de trabalho.",
  enableOrb: "Ativar o círculo flutuante",
  hideOrbSetting: "Ocultar o círculo",
  hideOrbHint: "Traga de volta pelo ícone do Circle nos ícones ocultos da barra de tarefas.",
  orbSize: "Tamanho do círculo",
  sizeSmall: "Pequeno",
  sizeMedium: "Médio",
  sizeLarge: "Grande",
  opacity: "Opacidade em repouso",
  opacityHint: "O círculo volta a ficar opaco quando você passa o mouse.",
  showPercent: "Mostrar a porcentagem dentro do círculo",
  showPercentHint: "Desligue para deixar apenas o círculo.",
  alwaysOnTop: "Manter o círculo acima das outras janelas",
  alwaysOnTopHint: "Desligue para deixar que outras janelas o cubram.",
  lockPosition: "Travar a posição do círculo",
  lockPositionHint: "Impede que o círculo se mova ao ser arrastado.",
  resetPosition: "Redefinir posição",
  resetPositionHint: "Leva o círculo de volta ao canto inferior direito.",

  ringColor: "Cor do círculo",
  ringSection: "Círculo",
  updatesSection: "Atualização e alertas",
  systemSection: "Sistema",
  colorDynamic: "Acompanhar o uso",
  colorDynamicHint: "Verde, amarelo, laranja e vermelho conforme o crédito cai.",
  colorFixed: "Cor fixa",
  colorFixedHint: "Desenha o círculo sempre na cor escolhida.",
  customColor: "Personalizada",
  ringMetric: "Métrica do círculo",
  ringMetricHint: "Qual janela o círculo externo e a porcentagem seguem.",
  metricSession: "Sessão (5 horas)",
  metricWeek: "Semana (7 dias)",
  metricHighest: "A maior das duas",

  refreshInterval: "Atualizar a cada",
  refreshIntervalHint: "Com que frequência o Circle consulta o uso na Anthropic.",
  minutes: "min",
  notifications: "Notificações de uso",
  notificationsHint: "Avisar quando uma janela cruzar um limite.",
  thresholds: "Limites",
  thresholdsHint: "Porcentagens separadas por vírgula, por exemplo 75, 90.",
  launchAtLogin: "Iniciar o Circle ao entrar no Windows",
  launchAtLoginHint: "O Circle inicia minimizado na bandeja.",
  launchAtLoginUnavailable: "Indisponível nesta plataforma.",
  language: "Idioma",
  languageHint: "Vale para o círculo e para esta janela.",

  version: "Versão",
  platform: "Plataforma",
  dataFolder: "Pasta de dados",
  aboutBody: "O Circle lê as credenciais do Claude Code já presentes neste computador e consulta o seu uso atual na Anthropic. Inspirado no Metria.",
  privacyNote: "As credenciais nunca saem do seu computador: são lidas em tempo de execução e usadas apenas para chamar o endpoint de uso da Anthropic. Para a divisão por modelo, o Circle também lê os registros de sessão locais do Claude Code, guardando só nomes de modelos, horários e contagens de tokens — nunca o que você escreveu.",
  quitCircle: "Sair do Circle",
  quitHint: "Fecha o círculo e o ícone da bandeja.",

  colorOrange: "Laranja",
  colorGreen: "Verde",
  colorBlue: "Azul",
  colorPurple: "Roxo",
  colorPink: "Rosa",
  colorYellow: "Amarelo",
  colorTeal: "Turquesa",
  colorWhite: "Branco"
};

const dictionaries: Record<Language, Strings> = { en, "pt-BR": ptBR };

export function strings(language: Language): Strings {
  return dictionaries[language] ?? en;
}

export const ACCENT_LABEL_KEYS: Record<string, keyof Strings> = {
  orange: "colorOrange",
  green: "colorGreen",
  blue: "colorBlue",
  purple: "colorPurple",
  pink: "colorPink",
  yellow: "colorYellow",
  teal: "colorTeal",
  white: "colorWhite"
};

export const METRIC_LABEL_KEYS = { session: "session", week: "week", weekOpus: "weekOpus" } as const;
