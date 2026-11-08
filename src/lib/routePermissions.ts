// Definição das rotas por tipo de usuário
export const ROUTE_PERMISSIONS = {
  public: [
    '/',
    '/signup-type',
    '/patient-signup',
    '/psychologist-signup',
    '/psicologo/concluir-cadastro'
  ],
  patient: [
    '/home',
    '/support-groups',
    '/support-group/:groupId',
    '/journal',
    '/safety-plan',
    '/safety-plan/', // cadastro (/novo) e edição (/:id)
    '/habitos',
    '/habitos/', // novo, detalhe e edição
    '/beneficio-empresa', // B2B: código da empresa
    '/empresa', // B2B: portal do RH
    '/sounds',
    '/sounds/category',
    '/sounds/subcategory', 
    '/sounds/player',
    '/sounds/feedback',
    '/breathing',
    '/comer-com-atencao',
    '/questionarios',
    '/questionarios/', // responder (/gad7, /phq9)
    '/sos',
    '/profile',
    '/account-settings',
    '/appointments',
    '/consultation-call/', // rotas com parâmetro (id da consulta)
    '/notifications',
    '/statistics',
    '/statistics/activity-history',
    '/achievements',
    '/subscription-plans',
    '/subscription-success',
    '/subscription-cancel',
    '/avulso/sucesso',
    '/chat', // chat disponível para pacientes
    '/emergency-call', // paciente e psicólogo podem acessar
    '/emergency-call/', // rotas com parâmetros
    '/emergency/call', // rota legacy para psicólogo
    '/paciente/suporte' // suporte para pacientes
  ],
  psychologist: [
    '/psychologist-dashboard',
    '/psychologist-profile',
    '/psychologist-availability',
    '/psychologist-payments',
    '/psychologist-notifications',
    '/psicologo/consultas',
    '/consultation-call/', // rotas com parâmetro (id da consulta)
    '/chat', // chat disponível para psicólogos
    '/emergency-call', // psicólogo pode atender chamada
    '/emergency-call/', // rotas com parâmetros
    '/emergency/call', // rota legacy
    '/emergency/call/', // rotas com parâmetros legacy
    '/psicologo/suporte' // suporte para psicólogos
  ],
  admin: [
    '/admin/verificacao', // código da verificação em duas etapas
    '/admin-dashboard',
    '/admin-notifications' // sino de avisos do painel
  ]
};
