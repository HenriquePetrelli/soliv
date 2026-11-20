import { Badge } from '@/components/ui/badge';
import { parseIdentityStatus, type PatientIdentityFields } from '@/lib/identityVerification';

const formatDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '');

/** Situação da identidade do paciente, como o painel do admin mostra. */
export const IdentityStatusBadge = ({ patient }: { patient: PatientIdentityFields }) => {
  const status = parseIdentityStatus(patient.identity_status);
  switch (status) {
    case 'aprovado':
      return (
        <Badge className="bg-success text-success-foreground hover:bg-success" title={`Confirmada em ${formatDate(patient.identity_reviewed_at)}`}>
          Identidade ok · {formatDate(patient.identity_reviewed_at)}
        </Badge>
      );
    case 'pendente':
      return (
        <Badge variant="outline" className="border-warning text-warning" title={`Enviada em ${formatDate(patient.identity_submitted_at)}`}>
          Verificar · {formatDate(patient.identity_submitted_at)}
        </Badge>
      );
    case 'recusado':
      return (
        <Badge variant="destructive" title={patient.identity_rejection_reason ?? undefined}>
          Identidade recusada
        </Badge>
      );
    default:
      return <Badge variant="secondary">Não enviada</Badge>;
  }
};
