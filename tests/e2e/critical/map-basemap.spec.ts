import { test, expect } from "../fixtures/staging";

// The map screen can look healthy — pins, cards, the range circle's label — over a basemap that never draws. The
// breadth check (flows/screens.spec.ts) passed through exactly that after maplibre-gl 6, whose tile worker wasn't in
// the build. Vector tiles are only ever fetched by that worker, so a tile download is proof the basemap is drawing.
const VECTOR_TILE = /\.(pbf|mvt)(\?|$)/;

test("map: the basemap's vector tiles load", async ({ guest }) => {
  const pageErrors: string[] = [];
  guest.on("pageerror", (e) => pageErrors.push(e.message));
  const tile = guest.waitForResponse((r) => VECTOR_TILE.test(r.url()) && r.ok(), { timeout: 30_000 });

  await guest.goto("/map");
  await expect(guest.locator("canvas.maplibregl-canvas").first()).toBeVisible({ timeout: 20_000 });
  const response = await tile;
  expect(response.status()).toBe(200);

  // Pan and zoom: react-map-gl reads the camera on every move, which is what broke with the maplibre-gl 6 upgrade.
  const box = (await guest.locator("canvas.maplibregl-canvas").first().boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 3;
  await guest.mouse.move(x, y);
  await guest.mouse.down();
  await guest.mouse.move(x - 100, y + 40, { steps: 10 });
  await guest.mouse.up();
  await guest.mouse.wheel(0, -300);
  await guest.waitForTimeout(1_000);
  expect(pageErrors, "page errors").toEqual([]);
});
