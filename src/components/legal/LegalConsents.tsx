import { Checkbox } from "@/components/ui/checkbox";
import LegalDocumentDialog from "@/components/legal/LegalDocumentDialog";
import {
  AGE_18_TEXT,
  HEALTH_DATA_CONSENT_TEXT,
  LEGAL_PAGES,
  LegalDocumentId,
  LegalUserType,
  termsPageFor,
} from "@/lib/legal";
import { allConsentsGiven, consentKeysFor, EMPTY_CONSENTS, type ConsentKey, type ConsentState } from "@/components/legal/consents";

// Caixas de aceite do cadastro (e do novo aceite quando um texto muda).
// Termos e Política são aceitos juntos; o consentimento para dados de saúde
// fica separado e destacado, como pede a LGPD (art. 11, I).

const linkClass = "text-primary underline underline-offset-2 font-medium";

interface LegalConsentsProps {
  userType: LegalUserType;
  value: ConsentState;
  onChange: (value: ConsentState) => void;
  showErrors?: boolean;
  /** Só os documentos que faltam aceitar; sem isso, todos os do cadastro. */
  documents?: LegalDocumentId[];
}

const LegalConsents = ({ userType, value, onChange, showErrors = false, documents }: LegalConsentsProps) => {
  const keys = consentKeysFor(userType, documents);
  const terms = termsPageFor(userType);
  const toggle = (key: ConsentKey, checked: boolean) => onChange({ ...value, [key]: checked });
  const errorRing = (key: ConsentKey) => (showErrors && !value[key] ? "border-destructive" : "");

  return (
    <div className="space-y-3">
      {keys.includes("age_18") && (
        <label className="flex items-start gap-3 text-sm">
          <Checkbox
            id="consent-age"
            checked={value.age_18}
            onCheckedChange={(checked) => toggle("age_18", checked === true)}
            className={`mt-0.5 ${errorRing("age_18")}`}
            aria-label={AGE_18_TEXT}
          />
          <span>{AGE_18_TEXT}</span>
        </label>
      )}

      {keys.includes("terms") && (
        <div className="flex items-start gap-3 text-sm">
          <Checkbox
            id="consent-terms"
            checked={value.terms}
            onCheckedChange={(checked) => toggle("terms", checked === true)}
            className={`mt-0.5 ${errorRing("terms")}`}
            aria-label="Li e aceito os Termos de Uso e a Política de Privacidade"
          />
          <span>
            <label htmlFor="consent-terms">Li e aceito os </label>
            <LegalDocumentDialog document={terms.id}>
              <button type="button" className={linkClass}>Termos de Uso</button>
            </LegalDocumentDialog>
            {" e a "}
            <LegalDocumentDialog document={LEGAL_PAGES.privacy_policy.id}>
              <button type="button" className={linkClass}>Política de Privacidade</button>
            </LegalDocumentDialog>
            .
          </span>
        </div>
      )}

      {keys.includes("health_data_consent") && (
        <label
          className={`flex items-start gap-3 text-sm rounded-lg border p-3 bg-primary/5 ${
            showErrors && !value.health_data_consent ? "border-destructive" : "border-primary/30"
          }`}
        >
          <Checkbox
            id="consent-health"
            checked={value.health_data_consent}
            onCheckedChange={(checked) => toggle("health_data_consent", checked === true)}
            className="mt-0.5"
            aria-label="Consentimento para dados de saúde"
          />
          <span>
            <strong className="block mb-1">Consentimento para dados de saúde</strong>
            {HEALTH_DATA_CONSENT_TEXT}
          </span>
        </label>
      )}

      {showErrors && !allConsentsGiven(value, keys) && (
        <p className="text-sm text-destructive">Marque todas as confirmações para continuar.</p>
      )}
    </div>
  );
};

export default LegalConsents;
