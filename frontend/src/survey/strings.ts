export type Lang = 'en' | 'es'

type Dict = Record<string, string>

const EN: Dict = {
  // Page chrome
  page_title: 'Pilot survey',
  page_lead:
    'A few short questions about this week. Skip anything that does not apply. Submitting anonymously is fine.',
  submit: 'Submit responses',
  submitting: 'Submitting…',
  submit_disabled_role: 'Choose your role to submit',
  thanks_title: 'Thanks for the feedback',
  thanks_body:
    'Your responses were recorded. Honest input is how this place gets better — appreciated.',
  submit_another: 'Submit another',
  error_prefix: "Couldn't submit:",
  unknown_error: 'unknown error',
  progress: 'answered',
  lang_en: 'EN',
  lang_es: 'ES',
  lang_toggle_aria: 'Switch survey language',

  // Comment prompts
  comment_any: 'Any specific comments?',
  comment_improve: 'What specifically could be improved?',
  comment_anything_improve: 'Anything specific that can be improved?',
  comment_latency: 'What did you notice?',

  // Question titles
  q_pilot_role: 'I am currently, primarily a:',
  q_job_satisfaction: 'How satisfied are you with your job as an Ultra Pilot overall?',
  q_teleop_experience: 'How satisfied are you with the teleoperation experience overall?',
  q_headset_app: 'How well did the headset app work this week?',
  q_latency_wow: 'How was the latency this week?',
  q_shift_schedule: 'How well did the shift scheduling tool/process work this week?',
  q_leaderboard_badges:
    'How satisfied are you with pilot leaderboard and badge functionality in the web app?',
  q_comfort_overall:
    'How comfortable are you overall while piloting the robot (from equipment to UI)?',
  q_training_program:
    'How well did the training program prepare you for data collection and beyond?',
  q_physical_demand:
    'How manageable is the physical demand of operating (headset fatigue, eye strain, break frequency) during a typical shift?',
  q_growth_support:
    'How well does Ultra/Remotics support your growth and recognize your performance as a pilot?',
  q_anything_else: 'Anything else on your mind?',
  q_anything_else_placeholder:
    'Open the floor: praise, frustrations, ideas, anything at all.',

  // Pilot role options
  role_trainee: 'Trainee Pilot',
  role_data_collection: 'Data Collection Pilot',
  role_customer: 'Customer Pilot',

  // Satisfaction scale
  sat_vsat: 'Very satisfied',
  sat_sat: 'Satisfied',
  sat_neu: 'Neutral',
  sat_uns: 'Unsatisfied',
  sat_vuns: 'Very unsatisfied',

  // Manageable scale
  man_vman: 'Very manageable',
  man_man: 'Manageable',
  man_neu: 'Neutral',
  man_unman: 'Unmanageable',
  man_vunman: 'Very unmanageable',

  // Well scale
  well_vwell: 'Very well',
  well_well: 'Well',
  well_neu: 'Neutral',
  well_poor: 'Poorly',
  well_vpoor: 'Very poorly',

  // Headset-app scale
  hs_great: 'Worked great',
  hs_well: 'Worked well',
  hs_some: 'Some issues',
  hs_lots: 'Lots of issues',
  hs_unusable: "Couldn't use it",

  // Latency week-over-week scale
  lat_better: 'Better than last week',
  lat_same: 'Same as last week',
  lat_worse: 'Worse than last week',

  // Scheduling scale
  sch_great: 'Worked great',
  sch_well: 'Worked well',
  sch_neu: 'Neutral',
  sch_clunky: 'Clunky',
  sch_broken: 'Broken',

  // Comfort scale
  cmf_vcomf: 'Very comfortable',
  cmf_comf: 'Comfortable',
  cmf_neu: 'Neutral',
  cmf_uncomf: 'Uncomfortable',
  cmf_vuncomf: 'Very uncomfortable',

  // Training scale (includes opt-out)
  trn_vwell: 'Very well',
  trn_well: 'Well',
  trn_neu: 'Neutral',
  trn_poor: 'Poorly',
  trn_vpoor: 'Very poorly',
  trn_na: "Doesn't apply to me",
}

const ES: Dict = {
  page_title: 'Encuesta para Pilotos',
  page_lead:
    'Unas preguntas cortas sobre esta semana. Salta lo que no aplique. Puedes enviar de forma anónima.',
  submit: 'Enviar respuestas',
  submitting: 'Enviando…',
  submit_disabled_role: 'Selecciona tu rol para enviar',
  thanks_title: 'Gracias por tus comentarios',
  thanks_body:
    'Tus respuestas fueron registradas. La honestidad nos ayuda a mejorar — se aprecia.',
  submit_another: 'Enviar otra',
  error_prefix: 'No se pudo enviar:',
  unknown_error: 'error desconocido',
  progress: 'respondidas',
  lang_en: 'EN',
  lang_es: 'ES',
  lang_toggle_aria: 'Cambiar el idioma de la encuesta',

  comment_any: '¿Algún comentario en particular?',
  comment_improve: '¿Qué específicamente se podría mejorar?',
  comment_anything_improve: '¿Algo específico que se pueda mejorar?',
  comment_latency: '¿Qué notaste?',

  q_pilot_role: 'Actualmente soy, principalmente:',
  q_job_satisfaction:
    '¿Qué tan satisfecho estás con tu trabajo como Piloto Ultra en general?',
  q_teleop_experience:
    '¿Qué tan satisfecho estás con la experiencia de teleoperación en general?',
  q_headset_app: '¿Qué tan bien funcionó la app del headset esta semana?',
  q_latency_wow: '¿Cómo estuvo la latencia esta semana?',
  q_shift_schedule:
    '¿Qué tan bien funcionó la herramienta/proceso de horarios esta semana?',
  q_leaderboard_badges:
    '¿Qué tan satisfecho estás con la tabla de líderes y las insignias en la app?',
  q_comfort_overall:
    '¿Qué tan cómodo te sientes en general operando el robot (equipo e interfaz)?',
  q_training_program:
    '¿Qué tan bien te preparó el programa de entrenamiento para la recolección de datos y más allá?',
  q_physical_demand:
    '¿Qué tan manejable es la demanda física de operar (fatiga del headset, vista cansada, frecuencia de descansos) en un turno típico?',
  q_growth_support:
    '¿Qué tan bien apoyan Ultra/Remotics tu crecimiento y reconocen tu desempeño como piloto?',
  q_anything_else: '¿Algo más en tu mente?',
  q_anything_else_placeholder:
    'Comparte lo que sea: felicitaciones, frustraciones, ideas, lo que quieras.',

  role_trainee: 'Piloto en Entrenamiento',
  role_data_collection: 'Piloto de Recolección de Datos',
  role_customer: 'Piloto de Cliente',

  sat_vsat: 'Muy satisfecho',
  sat_sat: 'Satisfecho',
  sat_neu: 'Neutral',
  sat_uns: 'Insatisfecho',
  sat_vuns: 'Muy insatisfecho',

  man_vman: 'Muy manejable',
  man_man: 'Manejable',
  man_neu: 'Neutral',
  man_unman: 'Inmanejable',
  man_vunman: 'Muy inmanejable',

  well_vwell: 'Muy bien',
  well_well: 'Bien',
  well_neu: 'Neutral',
  well_poor: 'Mal',
  well_vpoor: 'Muy mal',

  hs_great: 'Funcionó muy bien',
  hs_well: 'Funcionó bien',
  hs_some: 'Algunos problemas',
  hs_lots: 'Muchos problemas',
  hs_unusable: 'No pude usarla',

  lat_better: 'Mejor que la semana pasada',
  lat_same: 'Igual que la semana pasada',
  lat_worse: 'Peor que la semana pasada',

  sch_great: 'Funcionó muy bien',
  sch_well: 'Funcionó bien',
  sch_neu: 'Neutral',
  sch_clunky: 'Torpe',
  sch_broken: 'No funciona',

  cmf_vcomf: 'Muy cómodo',
  cmf_comf: 'Cómodo',
  cmf_neu: 'Neutral',
  cmf_uncomf: 'Incómodo',
  cmf_vuncomf: 'Muy incómodo',

  trn_vwell: 'Muy bien',
  trn_well: 'Bien',
  trn_neu: 'Neutral',
  trn_poor: 'Mal',
  trn_vpoor: 'Muy mal',
  trn_na: 'No aplica para mí',
}

const TABLES: Record<Lang, Dict> = { en: EN, es: ES }

export function t(lang: Lang, key: string): string {
  const v = TABLES[lang][key]
  if (v) return v
  const fallback = EN[key]
  if (!fallback && import.meta.env.DEV) {
    console.warn(`[survey i18n] missing key: ${key}`)
  }
  return fallback ?? key
}
