// Servidor local que imita Places API (New) e Instagram Graph API. SOLO PARA TESTS.
import { createServer } from "node:http";
import { googleCompleto, instagramCompleto } from "../fixtures/fixtures.js";

export function iniciarMock() {
  const llamadas = [];
  const srv = createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    llamadas.push({ metodo: req.method, ruta: url.pathname, cabeceras: req.headers });
    const json = (s, o) => { res.writeHead(s, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
    if (url.pathname.startsWith("/v1/")) {
      if (req.headers["x-goog-api-key"] !== "clave-test" || !req.headers["x-goog-fieldmask"]) return json(403, { error: { status: "PERMISSION_DENIED" } });
      if (req.method === "POST" && url.pathname === "/v1/places:searchText") {
        return json(200, { places: [
          { id: "ChIJ_OTRA", displayName: { text: "Otra Taberna" }, googleMapsUri: "https://maps.google.com/?cid=999", location: { latitude: 37.17, longitude: -3.59 } },
          { id: googleCompleto.id, displayName: googleCompleto.displayName, googleMapsUri: googleCompleto.googleMapsUri, location: googleCompleto.location },
        ] });
      }
      if (url.pathname === `/v1/places/${googleCompleto.id}`) return json(200, googleCompleto);
      return json(404, { error: { status: "NOT_FOUND" } });
    }
    if (url.pathname === "/v25.0/IG_TEST") {
      if (url.searchParams.get("access_token") !== "token-test") return json(400, { error: { code: 190 } });
      const usuario = /username\(([^)]+)\)/.exec(url.searchParams.get("fields") ?? "")?.[1];
      if (usuario === "cuenta_personal") return json(400, { error: { code: 110, error_subcode: 2207013, message: "not business" } });
      return json(200, { business_discovery: { ...instagramCompleto, username: usuario }, id: "IG_TEST" });
    }
    json(404, {});
  });
  return new Promise((r) => srv.listen(0, "127.0.0.1", () => r({ srv, url: `http://127.0.0.1:${srv.address().port}`, llamadas })));
}
