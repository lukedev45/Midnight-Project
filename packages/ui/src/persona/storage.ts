export interface Persona {
  pseudonymSecretHex: string;
  pseudonymHex: string;
  credentialId: string;
  enrolledAt: string;
}

const KEY = 'whistleblower.persona';

export function loadPersona(): Persona | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Persona;
  } catch {
    return null;
  }
}

export function savePersona(p: Persona): void {
  localStorage.setItem(KEY, JSON.stringify(p));
}

export function clearPersona(): void {
  localStorage.removeItem(KEY);
}
