// vs code's git extension encodes {path, ref} as JSON in the uri query;
// ref "" is the index, "~" index-or-HEAD, otherwise a revision
export type GitRef = { kind: "revision"; ref: string } | { kind: "working" };

export function parseGitQuery(query: string): { path: string; ref: GitRef } | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(query);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null) return undefined;
  const { path, ref } = parsed as Record<string, unknown>;
  if (typeof path !== "string" || typeof ref !== "string") return undefined;
  if (ref === "" || ref === "~") return { path, ref: { kind: "working" } };
  if (ref === "HEAD" || /^[0-9a-f]{4,64}$/i.test(ref)) return { path, ref: { kind: "revision", ref } };
  return undefined;
}
