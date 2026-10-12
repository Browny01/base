import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "..");
const host = execFileSync("rustc", ["-vV"], { encoding: "utf8" }).match(
  /^host: (.+)$/m,
)[1];
const target = process.env.TAURI_ENV_TARGET_TRIPLE || host;
const destination = resolve(root, "apps/desktop/src-tauri/binaries");
mkdirSync(destination, { recursive: true });
const manifest = resolve(root, "native/BaseWorkspace/Cargo.toml");
if (target === "universal-apple-darwin") {
  for (const arch of ["aarch64-apple-darwin", "x86_64-apple-darwin"])
    execFileSync(
      "cargo",
      ["build", "--manifest-path", manifest, "--release", "--target", arch],
      { stdio: "inherit" },
    );
  execFileSync(
    "lipo",
    [
      "-create",
      ...["aarch64-apple-darwin", "x86_64-apple-darwin"].map((arch) =>
        resolve(
          root,
          `native/BaseWorkspace/target/${arch}/release/base-workspace`,
        ),
      ),
      "-output",
      resolve(destination, `base-workspace-${target}`),
    ],
    { stdio: "inherit" },
  );
} else {
  execFileSync(
    "cargo",
    ["build", "--manifest-path", manifest, "--release", "--target", target],
    { stdio: "inherit" },
  );
  copyFileSync(
    resolve(
      root,
      `native/BaseWorkspace/target/${target}/release/base-workspace`,
    ),
    resolve(destination, `base-workspace-${target}`),
  );
}
