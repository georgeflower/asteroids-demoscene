export interface VersionCheckResult {
  versions: Record<string, string>;
  errors: string[];
  warnings: string[];
}
export function checkVersions(root?: string): VersionCheckResult;
