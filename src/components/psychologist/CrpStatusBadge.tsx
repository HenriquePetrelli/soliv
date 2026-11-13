import { Badge } from '@/components/ui/badge';
import { crpCheckState, type CrpVerificationFields } from '@/lib/crpVerification';

const formatDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '');

/** Situação do CRP no CFP, como o painel mostra. */
export const CrpStatusBadge = ({ psychologist }: { psychologist: CrpVerificationFields & { crp_situacao?: string | null } }) => {
  const state = crpCheckState(psychologist);
  const when = formatDate(psychologist.crp_verified_at);
  switch (state) {
    case 'ok':
      return (
        <Badge className="bg-success text-success-foreground hover:bg-success" title={`Conferido em ${when}`}>
          CFP ativo · {when}
        </Badge>
      );
    case 'vencida':
      return (
        <Badge variant="outline" className="border-warning text-warning" title={`Última consulta em ${when}`}>
          Reverificar · {when}
        </Badge>
      );
    case 'irregular':
      return (
        <Badge variant="destructive" title={`Consulta em ${when}`}>
          CFP: {psychologist.crp_situacao || 'irregular'}
        </Badge>
      );
    case 'nao_encontrado':
      return (
        <Badge variant="destructive" title={`Consulta em ${when}`}>
          Não achado no CFP
        </Badge>
      );
    default:
      return <Badge variant="secondary">Não verificado</Badge>;
  }
};
