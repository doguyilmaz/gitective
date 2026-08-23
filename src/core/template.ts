export interface TemplateValues {
  author: string;
  authorEmail: string;
  ago: string;
  date: string;
  message: string;
  sha: string;
}

export function renderTemplate(format: string, values: TemplateValues): string {
  return format.replace(/\$\{(\w+)\}/g, (match, key: string) =>
    Object.hasOwn(values, key) ? values[key as keyof TemplateValues] : match,
  );
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return max <= 1 ? "…" : `${text.slice(0, max - 1)}…`;
}

export function usesToken(format: string, token: keyof TemplateValues): boolean {
  return format.includes(`\${${token}}`);
}
