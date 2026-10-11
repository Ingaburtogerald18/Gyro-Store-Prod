// Campo de monto de DESIGN.md §7: el símbolo adentro, a la izquierda, y teclado decimal.
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "~/components/ui/input-group";

export function MoneyInput({
  id,
  value,
  onChange,
  currency = "usd",
  invalid,
  placeholder = "0.00",
  disabled,
  "aria-required": ariaRequired,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  currency?: "usd" | "nio";
  invalid?: boolean;
  placeholder?: string;
  disabled?: boolean;
  "aria-required"?: boolean;
}) {
  return (
    <InputGroup data-disabled={disabled || undefined}>
      <InputGroupAddon>
        <InputGroupText>{currency === "usd" ? "$" : "C$"}</InputGroupText>
      </InputGroupAddon>
      <InputGroupInput
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(",", "."))}
        inputMode="decimal"
        autoComplete="off"
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-required={ariaRequired}
        className="tabular-nums"
      />
    </InputGroup>
  );
}
