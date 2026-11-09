import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  BLOCK_PRESETS,
  BLOCK_UNITS,
  describeBlockDuration,
  previewBlockUntil,
  toBlockChoice,
  type BlockDurationValue,
  type BlockUnit,
} from '@/utils/psychologistBlock';

interface Props {
  value: BlockDurationValue;
  onChange: (value: BlockDurationValue) => void;
}

/**
 * Período do bloqueio: tempo indeterminado ou uma quantidade de horas, dias,
 * semanas, meses ou anos (com atalhos para os períodos mais usados).
 */
const BlockDurationPicker = ({ value, onChange }: Props) => {
  const unit = BLOCK_UNITS.find((u) => u.value === value.unit) ?? BLOCK_UNITS[0];
  const choice = toBlockChoice(value);
  const until = choice ? previewBlockUntil(choice) : null;

  const chip = (active: boolean) =>
    cn(
      'rounded-full border px-3 py-1 text-xs transition-colors',
      active ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted',
    );

  return (
    <div className="space-y-3">
      <Label>Período de bloqueio</Label>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Atalhos de período">
        {BLOCK_PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            className={chip(!value.indefinite && value.unit === p.unit && Number(value.amount) === p.amount)}
            onClick={() => onChange({ indefinite: false, unit: p.unit, amount: String(p.amount) })}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          className={chip(value.indefinite)}
          onClick={() => onChange({ ...value, indefinite: true })}
        >
          Tempo indeterminado
        </button>
      </div>

      {!value.indefinite && (
        <div className="flex gap-2">
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={unit.max}
            step={1}
            value={value.amount}
            onChange={(e) => onChange({ ...value, amount: e.target.value.replace(/\D/g, '') })}
            placeholder="Quantidade"
            aria-label="Quantidade"
            className="w-28"
          />
          <Select value={value.unit} onValueChange={(u) => onChange({ ...value, unit: u as BlockUnit })}>
            <SelectTrigger aria-label="Unidade">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BLOCK_UNITS.map((u) => (
                <SelectItem key={u.value} value={u.value}>
                  {u.plural.charAt(0).toUpperCase() + u.plural.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <p className="text-xs text-muted-foreground" data-testid="block-duration-preview">
        {value.indefinite
          ? 'A conta fica bloqueada até um admin desbloquear.'
          : choice && until
            ? `${describeBlockDuration(choice)}: bloqueada até ${until.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}.`
            : value.amount
              ? `Digite de 1 a ${unit.max} ${unit.plural}.`
              : 'Escolha um atalho ou digite a quantidade.'}
      </p>
    </div>
  );
};

export default BlockDurationPicker;
