import { useState } from "react";

interface PremiumToggleProps {
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  label?: string;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
}

export function PremiumToggle({
  checked,
  defaultChecked = false,
  onChange,
  label,
  ariaLabel,
  disabled = false,
  className = "",
}: PremiumToggleProps) {
  const [internalChecked, setInternalChecked] = useState(defaultChecked);
  const [isPressed, setIsPressed] = useState(false);
  const isControlled = checked !== undefined;
  const isChecked = isControlled ? checked : internalChecked;

  const handleToggle = () => {
    if (disabled) return;
    const nextValue = !isChecked;
    if (!isControlled) setInternalChecked(nextValue);
    onChange?.(nextValue);
  };

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {label && (
        <span
          className={
            "text-sm font-medium transition-colors duration-300 " +
            (isChecked ? "text-slate-900" : "text-slate-500")
          }
        >
          {label}
        </span>
      )}
      <button
        type="button"
        role="switch"
        aria-label={ariaLabel ?? label ?? "Toggle setting"}
        aria-checked={isChecked}
        disabled={disabled}
        onClick={handleToggle}
        onMouseDown={() => setIsPressed(true)}
        onMouseUp={() => setIsPressed(false)}
        onMouseLeave={() => setIsPressed(false)}
        onBlur={() => setIsPressed(false)}
        className={
          "group relative h-8 w-14 shrink-0 rounded-full p-1 transition-all duration-500 ease-out " +
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white " +
          "disabled:cursor-not-allowed disabled:opacity-50 " +
          (isChecked
            ? "bg-slate-900 shadow-[0_0_20px_rgba(0,0,0,0.15)]"
            : "bg-slate-200")
        }
      >
        <div
          className={
            "absolute inset-0 rounded-full transition-opacity duration-500 " +
            (isChecked ? "opacity-100" : "opacity-0")
          }
        />
        <div
          className={
            "absolute inset-[2px] rounded-full transition-all duration-500 " +
            (isChecked
              ? "bg-gradient-to-b from-slate-900 to-slate-800"
              : "bg-transparent")
          }
        />
        <div
          className={
            "relative h-6 w-6 rounded-full bg-white shadow-lg transition-all duration-500 ease-[cubic-bezier(0.68,-0.55,0.265,1.55)] " +
            (isChecked ? "translate-x-6" : "translate-x-0") +
            (isPressed ? " scale-90 duration-150" : "")
          }
        >
          <div className="absolute inset-[2px] rounded-full bg-gradient-to-b from-white via-white to-slate-100" />
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-white/80 via-transparent to-transparent" />
          <div
            className={
              "absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full transition-all duration-500 " +
              (isChecked ? "bg-slate-900 opacity-100" : "bg-slate-400 opacity-100")
            }
          />
          <div
            key={isChecked ? "on" : "off"}
            className={
              "absolute inset-0 rounded-full transition-all duration-700 " +
              (isChecked
                ? "animate-ping scale-150 bg-slate-900/20 opacity-0"
                : "scale-100 opacity-0")
            }
          />
        </div>
      </button>
    </div>
  );
}
