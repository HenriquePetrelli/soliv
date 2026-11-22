/**
 * Remetente de todos os e-mails enviados pelas edge functions (Resend).
 * O domínio precisa estar verificado no Resend (SPF e DKIM), senão o envio é recusado.
 */
export const EMAIL_DOMAIN = "solivsaude.com.br";
export const EMAIL_FROM = `Soliv <nao-responda@${EMAIL_DOMAIN}>`;
