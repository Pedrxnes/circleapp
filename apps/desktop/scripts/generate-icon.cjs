// resources/icon.png is a static designed asset (checked into git), not
// generated. This just checks it's there before electron-builder runs.
const { existsSync } = require("node:fs");
const { join } = require("node:path");

const iconPath = join(__dirname, "..", "resources", "icon.png");
if (!existsSync(iconPath)) {
  throw new Error(`Missing ${iconPath}`);
}
console.log("resources/icon.png present");
