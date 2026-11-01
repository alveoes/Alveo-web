// Sectores habituales y vocabulario usado para comprobar si la oferta se menciona
// en textos públicos (biografía y pies de publicación). La comparación ignora
// mayúsculas y tildes. Las palabras genéricas de «otro» se aplican a todos.

export const SECTORES = [
  { id: "restauracion", nombre: "Restaurante, bar o cafetería", hosteleria: true,
    palabras: ["carta", "menu", "tapas", "tapa", "cocina", "restaurante", "bar", "cafe", "cafeteria", "desayuno", "desayunos", "almuerzo", "comida", "comidas", "cena", "cenas", "brunch", "vinos", "cerveza", "raciones", "platos", "postres", "terraza", "para llevar", "a domicilio"] },
  { id: "alimentacion", nombre: "Panadería, pastelería o alimentación", hosteleria: false,
    palabras: ["pan", "panaderia", "pasteleria", "tartas", "tarta", "dulces", "bolleria", "obrador", "encargos", "productos", "fruteria", "carniceria", "charcuteria", "gourmet", "ecologico", "artesano", "artesanal"] },
  { id: "peluqueria", nombre: "Peluquería o barbería", hosteleria: false,
    palabras: ["peluqueria", "barberia", "corte", "cortes", "color", "mechas", "tinte", "peinado", "peinados", "barba", "fade", "keratina", "alisado", "recogidos", "novias", "tratamientos capilares"] },
  { id: "estetica", nombre: "Estética, uñas o belleza", hosteleria: false,
    palabras: ["estetica", "unas", "manicura", "pedicura", "pestanas", "cejas", "depilacion", "laser", "facial", "faciales", "masaje", "masajes", "tratamiento", "tratamientos", "maquillaje", "micropigmentacion", "spa"] },
  { id: "salud", nombre: "Salud, fisioterapia o clínica", hosteleria: false,
    palabras: ["fisioterapia", "fisio", "clinica", "consulta", "tratamiento", "tratamientos", "rehabilitacion", "osteopatia", "podologia", "psicologia", "nutricion", "dental", "dentista", "ortodoncia", "implantes", "optica", "revision", "terapia"] },
  { id: "deporte", nombre: "Gimnasio, deporte o bienestar", hosteleria: false,
    palabras: ["gimnasio", "gym", "entrenamiento", "entrenador", "clases", "pilates", "yoga", "crossfit", "funcional", "boxeo", "spinning", "bonos", "cuotas", "entrenamiento personal", "danza", "baile"] },
  { id: "comercio", nombre: "Tienda o comercio", hosteleria: false,
    palabras: ["tienda", "moda", "ropa", "complementos", "zapatos", "calzado", "regalos", "novedades", "coleccion", "rebajas", "envios", "tienda online", "productos", "marcas", "joyeria", "floristeria", "libreria", "decoracion"] },
  { id: "alojamiento", nombre: "Alojamiento turístico", hosteleria: false,
    palabras: ["hotel", "hostal", "apartamento", "apartamentos", "alojamiento", "habitaciones", "habitacion", "casa rural", "cortijo", "reservas", "estancia", "huespedes", "suite", "vistas", "desayuno incluido"] },
  { id: "ocio", nombre: "Ocio, turismo o experiencias", hosteleria: false,
    palabras: ["tours", "tour", "visitas", "visita guiada", "experiencias", "excursiones", "rutas", "actividades", "entradas", "flamenco", "espectaculo", "eventos", "escape room", "talleres"] },
  { id: "automocion", nombre: "Taller o automoción", hosteleria: false,
    palabras: ["taller", "mecanica", "neumaticos", "itv", "revision", "chapa", "pintura", "lavado", "coches", "vehiculos", "motos", "diagnosis", "cambio de aceite", "alquiler"] },
  { id: "hogar", nombre: "Reformas, hogar o instalaciones", hosteleria: false,
    palabras: ["reformas", "reforma", "fontaneria", "electricidad", "electricista", "pintura", "carpinteria", "cocinas", "banos", "climatizacion", "aire acondicionado", "instalaciones", "mantenimiento", "obras", "limpieza", "cerrajeria"] },
  { id: "profesional", nombre: "Servicios profesionales", hosteleria: false,
    palabras: ["asesoria", "gestoria", "abogados", "abogado", "abogada", "consultoria", "contabilidad", "seguros", "inmobiliaria", "arquitectura", "diseno", "fotografia", "fotografo", "marketing", "servicios", "asesoramiento"] },
  { id: "formacion", nombre: "Academia o formación", hosteleria: false,
    palabras: ["academia", "clases", "cursos", "curso", "formacion", "idiomas", "ingles", "oposiciones", "refuerzo", "matricula", "profesores", "talleres", "autoescuela", "musica"] },
  { id: "otro", nombre: "Otro", hosteleria: false, palabras: [] },
];

// Palabras de oferta genéricas, válidas para cualquier sector.
export const PALABRAS_GENERICAS = ["servicios", "productos", "precios", "precio", "ofertas", "oferta", "promocion", "promociones", "catalogo", "presupuesto", "presupuestos", "encargos", "pedidos"];

export function sectorPorId(id) {
  return SECTORES.find((s) => s.id === id) ?? null;
}

export function normalizar(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Devuelve las palabras de oferta del sector encontradas en el texto (como palabras completas). */
export function palabrasDeOferta(texto, sectorId, sectorOtroTexto = "") {
  const t = ` ${normalizar(texto).replace(/[^a-z0-9ñ]+/g, " ")} `;
  const sector = sectorPorId(sectorId);
  const lista = new Set([...(sector?.palabras ?? []), ...PALABRAS_GENERICAS]);
  // Para «Otro», las palabras que el propio negocio escribió (de 4+ letras) también cuentan.
  if (sectorId === "otro") {
    for (const p of normalizar(sectorOtroTexto).split(/[^a-z0-9ñ]+/)) if (p.length >= 4) lista.add(p);
  }
  const encontradas = [];
  for (const p of lista) if (t.includes(` ${p} `)) encontradas.push(p);
  return encontradas;
}
