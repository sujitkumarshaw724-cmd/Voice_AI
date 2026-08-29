export interface MacroStep {
  tool: string;
  args: Record<string, any>;
}

export interface Macro {
  id: string;
  name: string;
  createdAt: string;
  steps: MacroStep[];
}

const MACROS_KEY = "zoya_macros";

export function getMacros(): Macro[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(MACROS_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

export function saveMacros(macros: Macro[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(MACROS_KEY, JSON.stringify(macros));
}

/** Saves a new macro, or overwrites an existing one with the same name (case-insensitive). */
export function addOrUpdateMacro(name: string, steps: MacroStep[]): Macro {
  const macros = getMacros().filter(m => m.name.toLowerCase() !== name.toLowerCase());
  const newMacro: Macro = {
    id: "macro_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
    name,
    createdAt: new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }),
    steps
  };
  macros.unshift(newMacro);
  saveMacros(macros);
  return newMacro;
}

export function deleteMacro(id: string): void {
  const macros = getMacros().filter(m => m.id !== id);
  saveMacros(macros);
}

/** Finds a saved macro whose name best matches the given phrase (exact match first, then substring). */
export function findMacroByName(query: string): Macro | null {
  const macros = getMacros();
  const q = query.trim().toLowerCase();
  const exact = macros.find(m => m.name.toLowerCase() === q);
  if (exact) return exact;
  const partial = macros.find(m => m.name.toLowerCase().includes(q) || q.includes(m.name.toLowerCase()));
  return partial || null;
}
