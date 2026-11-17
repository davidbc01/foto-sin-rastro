import init, { revelar, limpiar } from "./pkg/foto_sin_rastro.js";

const $ = (id) => document.getElementById(id);
const zona = $("zona");
const entrada = $("archivo");

let urlVista = null;
let urlDescarga = null;
let niveles = {}; // nivel de cada fila: alto | medio | nada

await init();

// ---------- entrada de la foto ----------
zona.addEventListener("click", () => entrada.click());
zona.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    entrada.click();
  }
});
zona.addEventListener("dragover", (e) => {
  e.preventDefault();
  zona.classList.add("encima");
});
zona.addEventListener("dragleave", () => zona.classList.remove("encima"));
zona.addEventListener("drop", (e) => {
  e.preventDefault();
  zona.classList.remove("encima");
  const f = e.dataTransfer.files[0];
  if (f) procesar(f);
});
entrada.addEventListener("change", () => {
  if (entrada.files[0]) procesar(entrada.files[0]);
  entrada.value = "";
});
$("otra").addEventListener("click", () => {
  $("resultado").classList.add("oculto");
  zona.classList.remove("oculto");
  window.scrollTo({ top: 0, behavior: "smooth" });
});

// ---------- utilidades ----------
function nombreBase(nombre) {
  const i = nombre.lastIndexOf(".");
  return i > 0 ? nombre.slice(0, i) : nombre;
}

function esJpg(bytes) {
  return bytes[0] === 0xff && bytes[1] === 0xd8;
}

// Siempre textContent: los metadatos de una foto no son de fiar.
function fila(clave, texto, nivel) {
  const el = $("fila-" + clave);
  const valor = { movil: "movil", fecha: "fecha", ubic: "ubicacion" }[clave];
  el.className = "fila " + nivel;
  $(valor).textContent = texto;
  $("chip-" + clave).textContent =
    nivel === "alto" ? "Te delata" : nivel === "medio" ? "Se ve" : "No consta";
  niveles[clave] = nivel;
}

function veredicto(nivel, texto, porcentaje) {
  const n = $("nivel");
  n.className = nivel;
  n.textContent =
    nivel === "alto" ? "EXPOSICIÓN ALTA"
    : nivel === "medio" ? "EXPOSICIÓN MEDIA"
    : nivel === "limpio" ? "LIMPIA"
    : "EXPOSICIÓN BAJA";
  $("veredicto").textContent = texto;
  const m = $("medidor");
  m.style.width = porcentaje + "%";
  m.style.background =
    nivel === "alto" ? "var(--rojo)" : nivel === "medio" ? "var(--ambar)" : "var(--verde)";
}

function ponerVista(archivo, bytes) {
  const caja = $("foto");
  caja.querySelectorAll("img, .sinvista").forEach((x) => x.remove());
  if (urlVista) URL.revokeObjectURL(urlVista);
  urlVista = null;

  if (esJpg(bytes)) {
    urlVista = URL.createObjectURL(archivo);
    const img = document.createElement("img");
    img.alt = "Vista previa de tu foto (solo en tu navegador)";
    img.src = urlVista;
    caja.prepend(img);
  } else {
    const d = document.createElement("div");
    d.className = "sinvista";
    const b = document.createElement("b");
    b.textContent = "HEIC";
    d.append(b, "Tu navegador no sabe mostrar este formato, pero lo analizamos igual.");
    caja.prepend(d);
  }
  caja.classList.remove("escaneando");
  void caja.offsetWidth; // reinicia la animación
  caja.classList.add("escaneando");
}

// ---------- análisis ----------
async function procesar(archivo) {
  const bytes = new Uint8Array(await archivo.arrayBuffer());

  let info = null;
  try {
    info = revelar(bytes);
  } catch {
    info = null;
  }

  zona.classList.add("oculto");
  $("resultado").classList.remove("oculto");
  $("titulo").textContent = archivo.name;
  $("mapa").classList.add("oculto");
  $("mapa").onclick = null;
  $("descargar").disabled = false;
  $("descargar").textContent = "Limpiar y descargar";
  niveles = {};
  ponerVista(archivo, bytes);

  const lat = info?.latitud;
  const lon = info?.longitud;
  const hayUbic = lat !== undefined && lon !== undefined;
  const movil = info ? [info.marca, info.modelo].filter(Boolean).join(" ") : "";
  const fecha = info?.fecha ?? "";

  fila("movil", movil || "No consta", movil ? "medio" : "nada");
  fila("fecha", fecha || "No consta", fecha ? "medio" : "nada");
  fila(
    "ubic",
    hayUbic ? `${lat.toFixed(5)}, ${lon.toFixed(5)}` : "No consta",
    hayUbic ? "alto" : "nada"
  );

  if (hayUbic) {
    veredicto(
      "alto",
      "Quien reciba esta foto tal cual puede saber dónde se hizo, con margen de metros.",
      92
    );
    $("nota").textContent = "";
    $("mapa").classList.remove("oculto");
    $("mapa").onclick = () => {
      const ok = confirm(
        "Para ver el mapa se abrirá OpenStreetMap con estas coordenadas, " +
          "así que ese sitio web las conocerá. ¿Continuar?"
      );
      if (ok) {
        window.open(
          `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`,
          "_blank",
          "noopener,noreferrer"
        );
      }
    };
  } else if (movil || fecha) {
    veredicto("medio", "No lleva ubicación, pero sí dice con qué móvil y cuándo la hiciste.", 45);
    $("nota").textContent = "";
  } else {
    veredicto("bajo", "No hemos encontrado datos ocultos legibles en esta foto.", 8);
    $("nota").textContent =
      "Si el archivo no es un JPG/HEIC válido, la limpieza dará un aviso.";
  }

  $("descargar").onclick = () => descargar(archivo, bytes);
}

// ---------- limpieza ----------
function descargar(archivo, bytes) {
  let limpio;
  try {
    limpio = limpiar(bytes);
  } catch (e) {
    $("nota").textContent = `No se pudo limpiar: ${e.message ?? e}`;
    return;
  }

  if (urlDescarga) URL.revokeObjectURL(urlDescarga);
  urlDescarga = URL.createObjectURL(
    new Blob([limpio.datos], { type: "application/octet-stream" })
  );
  const a = document.createElement("a");
  a.href = urlDescarga;
  a.download = `${nombreBase(archivo.name)}_limpia.${limpio.extension}`;
  document.body.appendChild(a);
  a.click();
  a.remove();

  // Tachado visual de lo que había
  for (const [clave, nivel] of Object.entries(niveles)) {
    if (nivel === "nada") continue;
    const el = $("fila-" + clave);
    const valor = $({ movil: "movil", fecha: "fecha", ubic: "ubicacion" }[clave]);
    const largo = Math.min(Math.max(valor.textContent.length, 8), 22);
    el.className = "fila borrado";
    valor.textContent = "█".repeat(largo);
    $("chip-" + clave).textContent = "Borrado";
  }

  $("mapa").classList.add("oculto");
  $("descargar").textContent = "Descargada ✓";
  $("descargar").disabled = true;
  veredicto(
    "limpio",
    "Copia limpia descargada. Comparte esa, no la original.",
    4
  );
  $("nota").textContent =
    "La original sigue intacta en tu dispositivo: bórrala si ya no la necesitas.";
}
