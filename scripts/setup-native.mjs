import { existsSync, readFileSync, writeFileSync } from "node:fs";
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

const manifestPath = "android/app/src/main/AndroidManifest.xml";
const manifest = readFileSync(manifestPath, "utf8");
if (!manifest.includes('android:autoVerify="true"')) {
  const appLinks = `            <intent-filter android:autoVerify="true">
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="https" android:host="joinbounty.dev" />
            </intent-filter>
`;
  writeFileSync(manifestPath, manifest.replace("        </activity>", `${appLinks}        </activity>`));
}

