import React, { useRef } from "react";
import { CalendarDays, X } from "lucide-react";
import "./DateInput.css";

const DISPLAY = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

/** "2026-10-13" → "13 Oct 2026" (blank for anything else). */
export const formatIsoDate = (iso) => {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? "" : DISPLAY.format(date);
};

// A date field that shows dates the way the rest of the app does
// ("13 Oct 2026") instead of the browser's locale format (mm/dd/yyyy).
//
// Drop-in for <input type="date">: same value (YYYY-MM-DD), same onChange
// (an event whose target.value is the new date), min / max / required /
// disabled. The visible part is a read-only text input, so each form's own
// input styling applies; the native date input underneath supplies the
// calendar picker and required-field validation.
export default function DateInput({
  value,
  onChange,
  min,
  max,
  required = false,
  disabled = false,
  name,
  id,
  className = "",
  placeholder = "Select a date",
  "aria-label": ariaLabel,
  title,
}) {
  const nativeRef = useRef(null);
  const shown = formatIsoDate(value);

  const openPicker = () => {
    const input = nativeRef.current;
    if (!input || disabled) return;
    try {
      input.showPicker();
    } catch {
      input.focus();
      input.click();
    }
  };

  const clear = () => {
    if (disabled) return;
    onChange?.({ target: { value: "", name }, currentTarget: { value: "", name } });
  };

  return (
    <span className={`date-input${disabled ? " is-disabled" : ""}`}>
      <input
        type="text"
        readOnly
        id={id}
        className={`date-input__field ${className}`.trim()}
        value={shown}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={ariaLabel}
        title={title}
        aria-haspopup="dialog"
        onClick={openPicker}
        onKeyDown={(e) => {
          if (["Enter", " ", "ArrowDown", "F4"].includes(e.key)) {
            e.preventDefault();
            openPicker();
          } else if ((e.key === "Backspace" || e.key === "Delete") && value && !required) {
            e.preventDefault();
            clear();
          }
        }}
      />
      <input
        ref={nativeRef}
        type="date"
        className="date-input__native"
        tabIndex={-1}
        aria-hidden="true"
        name={name}
        value={value || ""}
        min={min}
        max={max}
        required={required}
        disabled={disabled}
        onChange={(e) => onChange?.(e)}
      />
      {value && !required && !disabled ? (
        <button type="button" className="date-input__btn" onClick={clear} aria-label="Clear the date" title="Clear">
          <X size={12} aria-hidden="true" />
        </button>
      ) : (
        <button type="button" className="date-input__btn" onClick={openPicker} disabled={disabled} tabIndex={-1} aria-hidden="true">
          <CalendarDays size={13} />
        </button>
      )}
    </span>
  );
}
