const SENSITIVE_INPUT_TYPES = new Set([
  "password",
  "credit-card",
  "tel",
  "email",
  "hidden",
]);

const SENSITIVE_NAME_PATTERNS = [
  /pass/i,
  /secret/i,
  /token/i,
  /auth/i,
  /card/i,
  /cvv/i,
  /cvc/i,
  /ssn/i,
  /pin/i,
  /account/i,
];

export function redactFormValue(
  element: HTMLInputElement | HTMLTextAreaElement | Element,
  originalValue: string
): string {
  const tagName = element.tagName.toUpperCase();
  if (tagName !== "INPUT" && tagName !== "TEXTAREA") {
    return originalValue;
  }

  const input = element as HTMLInputElement;
  const type = (input.type || "text").toLowerCase();
  const name = (input.name || "").toLowerCase();
  const id = (input.id || "").toLowerCase();
  const placeholder = input.placeholder || "";

  if (type === "password" || SENSITIVE_INPUT_TYPES.has(type)) {
    return placeholder || "••••••••";
  }

  for (const pattern of SENSITIVE_NAME_PATTERNS) {
    if (pattern.test(name) || pattern.test(id)) {
      return placeholder || "••••••••";
    }
  }

  // Redact typed user input values by default to protect user privacy
  if (placeholder) {
    return placeholder;
  }

  return originalValue.length > 0 ? "••••••••" : "";
}
