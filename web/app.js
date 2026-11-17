import init, { revelar, limpiar } from "./pkg/foto_sin_rastro.js";

const $ = (id) => document.getElementById(id);
const zona = $("zona");
const entrada = $("archivo");

let urlDescarga = null;

await init();

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
});

function nombreBase(nombre) {
  const i = nombre.lastIndexOf(".");
  return i > 0 ? nombre.slice(0, i) : nombre;
}

async function procesar(archivo) {
  const bytes = new Uint8Array(await archivo.arrayBuffer());

  // Siempre con textContent: los metadatos de una foto no son de fiar.
  let info = null;
  let sinDatos = false;
  try {
    info = revelar(bytes);
  } catch {
    sinDatos = true;
  }

  $("resultado").classList.remove("oculto");
  $("titulo").textContent = archivo.name;
  $("mapa").classList.add("oculto");
  $("mapa").onclick = null;

  if (sinDatos || !info) {
    $("movil").textContent = "No consta";
    $("fecha").textContent = "No consta";
    $("ubicacion").textContent = "No consta";
    $("nota").textContent =
      "Esta foto no tiene metadatos EXIF legibles (o no es un JPG/HEIC válido).";
  } else {
    const movil = [info.marca, info.modelo].filter(Boolean).join(" ");
    $("movil").textContent = movil || "No consta";
    $("fecha").textContent = info.fecha || "No consta";

    const lat = info.latitud;
    const lon = info.longitud;
    const ub = $("ubicacion");
    if (lat !== undefined && lon !== undefined) {
      ub.textContent = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
      ub.className = "alerta";
      $("nota").textContent =
        "Cualquiera que reciba esta foto original puede saber dónde se hizo.";
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
    } else {
      ub.textContent = "No consta";
      ub.className = "bien";
      $("nota").textContent = "Esta foto no lleva ubicación.";
    }
  }

  $("descargar").onclick = () => descargar(archivo, bytes);
}

function descargar(archivo, bytes) {
  try {
    const limpio = limpiar(bytes);
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
  } catch (e) {
    $("nota").textContent = `No se pudo limpiar: ${e.message ?? e}`;
  }
}
