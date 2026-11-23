import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface SignupInviteCodeFieldProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string | null;
}

/** Campo do código de convite, nos cadastros de paciente e de psicólogo. */
export default function SignupInviteCodeField({ value, onChange, onBlur, error }: SignupInviteCodeFieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor="signup-invite-code" className="text-foreground font-medium">
        Código de convite
      </Label>
      <Input
        id="signup-invite-code"
        value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        onBlur={onBlur}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={40}
        placeholder="Código que você recebeu"
        aria-invalid={Boolean(error)}
        aria-describedby="signup-invite-code-help"
        className={`h-12 rounded-xl font-mono tracking-widest ${error ? 'border-destructive' : 'border-border'}`}
      />
      {error ? (
        <p id="signup-invite-code-help" role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : (
        <p id="signup-invite-code-help" className="text-sm text-muted-foreground">
          O Soliv está em fase de testes: por enquanto, o cadastro é só para convidados.
        </p>
      )}
    </div>
  );
}
