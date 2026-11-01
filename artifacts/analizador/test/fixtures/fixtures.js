// DATOS FICTICIOS EXCLUSIVOS PARA TESTS. Imitan la FORMA de las respuestas oficiales
// (Places API New / Instagram Graph API) pero no corresponden a ningún negocio real
// y nunca se cargan en producción.
const DIA = 86400000;
export const AHORA = Date.parse("2026-11-01T12:00:00Z");

export const googleCompleto = {
  id: "ChIJ_TEST_completo_0001",
  displayName: { text: "Taberna Ficticia de Prueba", languageCode: "es" },
  formattedAddress: "C. Inventada, 12, 18009 Granada, España",
  addressComponents: [
    { longText: "12", types: ["street_number"] },
    { longText: "Calle Inventada", types: ["route"] },
    { longText: "Granada", types: ["locality", "political"] },
    { longText: "Granada", types: ["administrative_area_level_2", "political"] },
    { longText: "Andalucía", types: ["administrative_area_level_1", "political"] },
  ],
  location: { latitude: 37.1761, longitude: -3.5976 },
  businessStatus: "OPERATIONAL",
  primaryType: "spanish_restaurant",
  primaryTypeDisplayName: { text: "Restaurante español" },
  types: ["spanish_restaurant", "restaurant", "bar", "food", "point_of_interest", "establishment"],
  regularOpeningHours: { periods: [{ open: { day: 1, hour: 12, minute: 0 }, close: { day: 1, hour: 16, minute: 0 } }], weekdayDescriptions: ["lunes: 12:00–16:00"] },
  nationalPhoneNumber: "958 00 00 00",
  websiteUri: "https://taberna-ficticia.example",
  googleMapsUri: "https://maps.google.com/?cid=1234567890",
  rating: 4.5,
  userRatingCount: 230,
  reviews: [
    { publishTime: new Date(AHORA - 10 * DIA).toISOString(), rating: 5, text: { text: "texto que no se guarda" }, authorAttribution: { displayName: "Persona" } },
    { publishTime: new Date(AHORA - 400 * DIA).toISOString(), rating: 4 },
  ],
  photos: Array.from({ length: 10 }, (_, i) => ({ name: `places/x/photos/${i}` })),
  dineIn: true, takeout: true, delivery: false, reservable: true,
};

export const googleMinimo = {
  id: "ChIJ_TEST_minimo_0002",
  displayName: { text: "Servicio Ficticio" },
  formattedAddress: "18600 Motril, Granada, España",
  addressComponents: [
    { longText: "Motril", types: ["locality", "political"] },
    { longText: "Granada", types: ["administrative_area_level_2", "political"] },
  ],
  primaryType: "point_of_interest",
  types: ["point_of_interest", "establishment"],
  googleMapsUri: "https://maps.google.com/?cid=222",
  userRatingCount: 0,
};

export const instagramCompleto = {
  username: "taberna_ficticia",
  name: "Taberna Ficticia · Granada",
  biography: "Cocina tradicional y tapas en el Realejo. C/ Inventada 12, Granada. Reservas por WhatsApp 600 000 000",
  website: "https://taberna-ficticia.example",
  profile_picture_url: "https://example.invalid/foto.jpg",
  media_count: 140,
  media: { data: [
    { timestamp: new Date(AHORA - 3 * DIA).toISOString(), caption: "Nuevo menú de otoño", media_type: "IMAGE" },
    { timestamp: new Date(AHORA - 12 * DIA).toISOString(), caption: "Tapas del día", media_type: "VIDEO" },
    { timestamp: new Date(AHORA - 30 * DIA).toISOString(), caption: "Nuestra terraza", media_type: "IMAGE" },
    { timestamp: new Date(AHORA - 60 * DIA).toISOString(), caption: "Equipo", media_type: "IMAGE" },
    { timestamp: new Date(AHORA - 200 * DIA).toISOString(), caption: "Carta nueva", media_type: "IMAGE" },
  ] },
};

export const instagramVacio = { username: "cuenta_vacia", name: "", biography: "", media_count: 0, media: { data: [] } };
