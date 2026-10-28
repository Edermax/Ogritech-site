import { readdir, readFile, stat } from 'node:fs/promises';

// Resolve both documents and source directories declared by the launch contract.
export async function collectLaunchEvidence(root, declaredPaths) {
  const files = new Set(), missing = new Set();
  async function visit(path, required = true) {
    if (/^https?:\/\//.test(path)) return;
    try {
      const info = await stat(new URL(path, root));
      if (info.isDirectory()) {
        const entries = await readdir(new URL(`${path}/`, root));
        let populated = false;
        for (const entry of entries) populated = await visit(`${path}/${entry}`, false) || populated;
        if (!populated && required) missing.add(path);
        return populated;
      } else if (!(await readFile(new URL(path, root))).length) missing.add(path);
      else { files.add(path); return true; }
    } catch { missing.add(path); }
    return false;
  }
  for (const path of new Set(declaredPaths)) await visit(path);
  return { files: [...files].sort(), missing: [...missing].sort() };
}
