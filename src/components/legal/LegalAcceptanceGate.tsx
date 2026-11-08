import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import LegalConsents from "@/components/legal/LegalConsents";
import { EMPTY_CONSENTS, allConsentsGiven, consentKeysFor } from "@/components/legal/consents";
import { setLegalGateStatus } from "@/lib/legalGateStatus";
import { LEGAL_PAGES, LegalDocumentId, fetchMissingAcceptances, recordAcceptances } from "@/lib/legal";

// Documentos legais e a troca de senha nunca ficam atrás do pedido de aceite.
const LEGAL_PATHS = [...Object.values(LEGAL_PAGES).map((page) => page.path), '/reset-password'];

/**
 * Pede o aceite quando falta algum documento na versão atual: contas criadas
 * antes do aceite existir e, sobretudo, quando os Termos ou a Política mudam
 * de versão. Montado no App, bloqueia o uso até o aceite (ou a saída).
 */
const LegalAcceptanceGate = () => {
  const { user, userType, signOut } = useAuth();
  const location = useLocation();
  const [missing, setMissing] = useState<LegalDocumentId[]>([]);
  const [consents, setConsents] = useState(EMPTY_CONSENTS);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);

  const legalUserType = userType === "patient" || userType === "psychologist" ? userType : null;

  useEffect(() => {
    setMissing([]);
    setConsents(EMPTY_CONSENTS);
    setShowErrors(false);
    const userId = user?.id;
    if (!userId || !legalUserType) {
      setLegalGateStatus("clear");
      return;
    }
    setLegalGateStatus("checking");
    let cancelled = false;
    fetchMissingAcceptances(userId, legalUserType)
      .then((docs) => {
        if (cancelled) return;
        setMissing(docs);
        setLegalGateStatus(docs.length > 0 ? "pending" : "clear");
      })
      // Se a consulta falhar, não trava o app: o pedido volta no próximo login.
      .catch((error) => {
        console.error("LegalAcceptanceGate: falha ao verificar aceites", error);
        if (!cancelled) setLegalGateStatus("clear");
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, legalUserType]);

  // Nunca atrapalha uma chamada em andamento, e deixa ler os documentos.
  const pathname = location.pathname;
  const insideCall =
    pathname.startsWith("/emergency-call") ||
    pathname.startsWith("/emergency/call") ||
    pathname.startsWith("/consultation-call");

  if (!user || !legalUserType || missing.length === 0 || insideCall || LEGAL_PATHS.includes(pathname)) {
    return null;
  }

  const keys = consentKeysFor(legalUserType, missing);

  const handleAccept = async () => {
    if (!allConsentsGiven(consents, keys)) {
      setShowErrors(true);
      return;
    }
    setSaving(true);
    try {
      await recordAcceptances(user.id, missing);
      setMissing([]);
      setLegalGateStatus("clear");
    } catch (error) {
      console.error("LegalAcceptanceGate: falha ao gravar aceite", error);
      toast.error("Não foi possível registrar o aceite. Tente de novo.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open>
      <DialogContent
        className="max-w-md [&>button]:hidden"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Termos de Uso e Política de Privacidade</DialogTitle>
          <DialogDescription>
            Para continuar usando o Soliv, leia e aceite os documentos abaixo. Se você já tinha aceitado,
            é porque eles foram atualizados.
          </DialogDescription>
        </DialogHeader>

        <LegalConsents
          userType={legalUserType}
          value={consents}
          onChange={setConsents}
          showErrors={showErrors}
          documents={missing}
        />

        <div className="flex flex-col gap-2 pt-2">
          <Button onClick={handleAccept} disabled={saving}>
            {saving ? "Salvando..." : "Aceitar e continuar"}
          </Button>
          <Button variant="ghost" onClick={() => signOut()} disabled={saving}>
            Sair
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LegalAcceptanceGate;
