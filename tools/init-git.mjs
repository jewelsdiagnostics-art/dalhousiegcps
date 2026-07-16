import fs from "node:fs";
import path from "node:path";
import git from "isomorphic-git";

const dir = process.cwd();
const author = {
  name: "Codex",
  email: "codex@local"
};

const ignored = new Set([
  ".git",
  "node_modules",
  ".firebase",
  ".netlify"
]);

function walk(currentDir, prefix = "") {
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (ignored.has(entry.name)) continue;
    const fullPath = path.join(currentDir, entry.name);
    const relPath = path.join(prefix, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath, relPath));
    } else {
      files.push(relPath);
    }
  }

  return files;
}

await git.init({ fs, dir });

const files = walk(dir).sort();
for (const filepath of files) {
  await git.add({ fs, dir, filepath });
}

const commit = await git.commit({
  fs,
  dir,
  author,
  message: "Initial commit",
  ref: "HEAD"
});

console.log(JSON.stringify({ files: files.length, commit }, null, 2));
