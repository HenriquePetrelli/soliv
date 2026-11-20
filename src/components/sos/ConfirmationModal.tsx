import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useEffect, useState } from "react";
import { MessageSquareText, Phone, ShieldCheck, Video } from "lucide-react";
import LifeRingIcon from "@/components/icons/LifeRingIcon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SOS_TRIAGE_OPTIONS, hasDangerRisk, hasSelfHarmRisk, saveSosTriage, type SosTriageKey } from "@/lib/sosTriage";
import { saveSosChannel, type SosChannel } from "@/lib/sosChannel";
import { saveSosTranscriptionConsent } from "@/lib/callTranscription";
import TranscriptionConsentCheckbox from "@/components/calls/TranscriptionConsentCheckbox";

interface ConfirmationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

/** O que acontece depois de confirmar: a pessoa sabe o que esperar antes de chamar. */
const stepsFor = (channel: SosChannel) => [
  channel === "text"
    ? { icon: MessageSquareText, text: "Um psicólogo disponível conversa com você por mensagem" }
    : { icon: Video, text: "Um psicólogo disponível atende você por vídeo" },
  { icon: ShieldCheck, text: "Enquanto espera, dá para abrir seu plano de segurança e respirar" },
  { icon: Phone, text: "Seu SOS do mês só é usado se o atendimento começar" },
];

/**
 * Confirmação em tela cheia antes de acionar o SOS de verdade — o toque no
 * botão de SOS não aciona a emergência no primeiro toque, abre esta tela.
 * Mesma cor laranja do botão de SOS; a ação principal fica em destaque e
 * "Agora não" fica discreto.
 */
const ConfirmationModal = ({ open, onOpenChange, onConfirm }: ConfirmationModalProps) => {
  // Triagem opcional: tocar marca/desmarca; o botão funciona sem marcar nada.
  const [triage, setTriage] = useState<SosTriageKey[]>([]);
  // Vídeo é o padrão; mensagem para quem não consegue falar agora.
  const [channel, setChannel] = useState<SosChannel>("video");
  // Por vídeo, a chamada é gravada e transcrita: o paciente consente aqui,
  // antes de chamar. Por mensagem não precisa (a conversa já é escrita).
  const [transcriptionConsent, setTranscriptionConsent] = useState(false);
  useEffect(() => {
    if (!open) {
      setTriage([]);
      setChannel("video");
      setTranscriptionConsent(false);
    }
  }, [open]);
  const needsConsent = channel === "video" && !transcriptionConsent;
  const toggle = (key: SosTriageKey) =>
    setTriage((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  const selfHarm = hasSelfHarmRisk(triage);
  const danger = hasDangerRisk(triage);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="fixed inset-0 left-0 top-0 z-50 flex h-full w-full max-w-none translate-x-0 translate-y-0 flex-col items-center justify-center gap-0 overflow-y-auto rounded-none border-0 bg-background sm:rounded-none p-0 shadow-none duration-200 data-[state=closed]:slide-out-to-left-0 data-[state=closed]:slide-out-to-top-0 data-[state=open]:slide-in-from-left-0 data-[state=open]:slide-in-from-top-0">
        <div className="flex w-full max-w-sm flex-col gap-6 px-6 py-10">
          <AlertDialogHeader className="items-center space-y-3 text-center sm:text-center">
            <div
              className="mb-1 flex h-14 w-14 items-center justify-center rounded-full bg-sos-secondary/10 text-sos-secondary ring-8 ring-sos-secondary/5"
              aria-hidden="true"
            >
              <LifeRingIcon className="h-7 w-7" />
            </div>
            <AlertDialogTitle className="text-2xl font-semibold text-foreground">
              Precisa de ajuda agora?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base text-muted-foreground">
              Vamos chamar um psicólogo para conversar com você agora.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div role="radiogroup" aria-label="Como você prefere conversar?" className="grid grid-cols-2 gap-2">
            {([
              { value: "video", label: "Por vídeo", icon: Video },
              { value: "text", label: "Por mensagem", icon: MessageSquareText },
            ] as const).map(({ value, label, icon: Icon }) => {
              const selected = channel === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setChannel(value)}
                  className={cn(
                    "flex min-h-12 items-center justify-center gap-2 rounded-xl border px-3 text-sm transition-colors",
                    selected
                      ? "border-primary bg-primary/10 font-semibold text-foreground"
                      : "border-border bg-card text-muted-foreground hover:bg-muted",
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {label}
                </button>
              );
            })}
          </div>
          {channel === "text" && (
            <p className="-mt-3 text-center text-xs text-muted-foreground">
              Para quando você não consegue falar agora. O psicólogo responde por escrito.
            </p>
          )}

          <section className="space-y-3" aria-labelledby="sos-triage-title">
            <div className="text-center">
              <p id="sos-triage-title" className="text-sm font-medium text-foreground">
                O que você está sentindo agora? <span className="font-normal text-muted-foreground">(opcional)</span>
              </p>
              <p className="text-xs text-muted-foreground">Assim o psicólogo já chega sabendo como te ajudar.</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {SOS_TRIAGE_OPTIONS.map(({ key, label }) => {
                const selected = triage.includes(key);
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggle(key)}
                    className={cn(
                      "min-h-10 rounded-full border px-3 py-2 text-left text-sm transition-colors",
                      selected
                        ? "border-primary bg-primary/10 font-medium text-foreground"
                        : "border-border bg-card text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {selfHarm && (
              <div role="alert" className="space-y-2 rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-sm">
                <p className="text-foreground">
                  Se você corre perigo agora, ligue. Enquanto isso, já estamos chamando um psicólogo.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Button asChild variant="outline" className="min-h-11">
                    <a href="tel:192"><Phone className="h-4 w-4" /> SAMU 192</a>
                  </Button>
                  <Button asChild variant="outline" className="min-h-11">
                    <a href="tel:188"><Phone className="h-4 w-4" /> CVV 188</a>
                  </Button>
                </div>
              </div>
            )}

            {danger && (
              <div role="alert" className="space-y-2 rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-sm">
                <p className="text-foreground">
                  Se alguém está colocando você em perigo, chame a polícia. Mulheres também podem ligar para o 180.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Button asChild variant="outline" className="min-h-11">
                    <a href="tel:190"><Phone className="h-4 w-4" /> Polícia 190</a>
                  </Button>
                  <Button asChild variant="outline" className="min-h-11">
                    <a href="tel:180"><Phone className="h-4 w-4" /> Ligue 180</a>
                  </Button>
                </div>
              </div>
            )}
          </section>

          {channel === "video" && (
            <TranscriptionConsentCheckbox
              id="sos-transcription-consent"
              checked={transcriptionConsent}
              onCheckedChange={setTranscriptionConsent}
            />
          )}

          <AlertDialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
            {needsConsent && (
              <p className="text-center text-xs text-muted-foreground" role="note">
                Marque o consentimento acima para chamar por vídeo, ou escolha "Por mensagem".
              </p>
            )}
            <AlertDialogAction
              disabled={needsConsent}
              onClick={(event) => {
                if (needsConsent) {
                  event.preventDefault();
                  return;
                }
                saveSosTriage(triage);
                saveSosChannel(channel);
                saveSosTranscriptionConsent(channel === "video" && transcriptionConsent);
                onConfirm();
              }}
              className="h-12 w-full bg-sos-secondary text-base font-semibold text-white hover:bg-sos-secondary-hover"
            >
              Sim, chamar um psicólogo
            </AlertDialogAction>
            <AlertDialogCancel className="mt-0 h-12 w-full border-0 bg-transparent text-base text-muted-foreground shadow-none hover:bg-muted hover:text-foreground">
              Agora não
            </AlertDialogCancel>
          </AlertDialogFooter>

          <ul className="space-y-3 rounded-2xl border border-border bg-card p-4">
            {stepsFor(channel).map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3 text-sm text-foreground">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary" aria-hidden="true">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="pt-1.5">{text}</span>
              </li>
            ))}
          </ul>

          <p className="text-center text-xs text-muted-foreground">
            Em risco imediato de vida, ligue para o{" "}
            <a href="tel:192" className="font-medium text-primary underline-offset-2 hover:underline">
              SAMU 192
            </a>
            . Para conversar agora com alguém, o{" "}
            <a href="tel:188" className="font-medium text-primary underline-offset-2 hover:underline">
              CVV 188
            </a>{" "}
            atende 24 horas.
          </p>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default ConfirmationModal;
