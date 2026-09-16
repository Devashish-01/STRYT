import { setWorkerUrl } from "maplibre-gl";
// `?worker&url` makes Vite bundle the worker together with the shared chunk it imports and emit it as its own file.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

/**
 * maplibre-gl 6 loads its tile worker from `new URL("./maplibre-gl-worker.mjs", import.meta.url)`. Bundlers don't
 * follow that reference, so the file never reaches the build: the worker fails to start, no tile is ever parsed, and
 * the map stays blank while pins and cards still draw on top of it. Pointing maplibre at the bundled worker fixes it.
 * Imported for its side effect before any map is created.
 */
setWorkerUrl(workerUrl);
