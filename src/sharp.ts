import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type sharpType from "sharp";
import { isCompiled } from "./assets";

// sharp is a native library and cannot live inside the single-file program. There it is
// loaded from the node_modules folder next to the program; otherwise as usual.
const require = createRequire(import.meta.url);
const sharp: typeof sharpType = require(isCompiled() ? join(dirname(process.execPath), "node_modules", "sharp.cjs") : "sharp");
export default sharp;
