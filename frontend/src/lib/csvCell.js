// Shared CSV cell escaping for hand-written CSV serializers.
// A cell beginning with a formula metacharacter (= + - @, or a leading tab/CR)
// can execute as a formula in a spreadsheet, so prefix a single quote to
// neutralize it. Quote (and double embedded quotes) when the cell contains
// ", comma, CR, or LF so a stray delimiter can't break the row.
export const FORMULA_LEAD = /^[=+\-@\t\r]/;
export function escapeCell(value) {
  let s = String(value ?? "");
  if (FORMULA_LEAD.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
