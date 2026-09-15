import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const run = (args) => {
  const result = spawnSync("npx", args, { stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

for (const platform of ["ios", "android"]) {
  if (!existsSync(platform)) run(["cap", "add", platform]);
}

run(["cap", "sync"]);
run(["@capacitor/assets", "generate", "--ios", "--android"]);

