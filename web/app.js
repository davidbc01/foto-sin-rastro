import init, { revelar, limpiar, version } from "./pkg/foto_sin_rastro.js";

const $ = (id) => document.getElementById(id);
const raiz = document.documentElement;
const zona = $("zona");
const entrada = $("archivo");

let urlVista = null;
let urlDescarga = null;

// ---------- cosas de la página que no dependen del wasm ----------

// Tema claro / oscuro (el valor inicial lo pone el script de la cabecera)
$("tema").addEventListener("click", () => {
  const nuevo = raiz.dataset.tema === "oscuro" ? "claro" : "oscuro";
  raiz.dataset.tema = nuevo;
  try {
    localStorage.setItem("tema", nuevo);
  } catch {}
});

// Las escenas aparecen al hacer scroll
const observador = new IntersectionObserver(
  (entradas) => {
    for (const e of entradas) {
      if (e.isIntersecting) {
        e.target.classList.add("visto");
        observador.unobserve(e.target);
      }
    }
  },
  { threshold: 0.18, rootMargin: "0px 0px -6% 0px" }
);
document.querySelectorAll(".revela").forEach((el) => observador.observe(el));

// Línea bajo la barra al bajar
const barra = $("top");
const marcarBarra = () => barra.classList.toggle("sombra", window.scrollY > 8);
window.addEventListener("scroll", marcarBarra, { passive: true });
marcarBarra();

// ---------- motor Rust (WebAssembly) ----------
await init();

const v = "v" + version();
document.querySelectorAll(".ver").forEach((el) => (el.textContent = v));

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
});

// ---------- utilidades ----------
function nombreBase(nombre) {
  const i = nombre.lastIndexOf(".");
  return i > 0 ? nombre.slice(0, i) : nombre;
}

function esJpg(bytes) {
  return bytes[0] === 0xff && bytes[1] === 0xd8;
}

// "16/11/2026 19:36:30" -> "16/11/2026 a las 19:36:30"
function partirFecha(texto) {
  const m = /^(\S+) (\S+)$/.exec(texto);
  return m ? `${m[1]} a las ${m[2]}` : texto;
}

// Siempre textContent: los metadatos de una foto no son de fiar.
function linea(prefijo, dato, sufijo, vacio, nivel) {
  const li = document.createElement("li");
  if (dato) {
    li.className = nivel;
    const s = document.createElement("span");
    s.className = "dato";
    s.textContent = dato;
    li.append(prefijo, s, sufijo);
  } else {
    li.className = "nada";
    li.textContent = vacio;
  }
  return li;
}

function resumen(texto, clase) {
  const r = $("resumen");
  r.className = clase;
  r.textContent = texto;
}

function ponerVista(archivo, bytes) {
  const marco = $("marco");
  marco.replaceChildren();
  if (urlVista) URL.revokeObjectURL(urlVista);
  urlVista = null;

  if (esJpg(bytes)) {
    urlVista = URL.createObjectURL(archivo);
    const img = document.createElement("img");
    img.alt = "Vista previa de tu foto (solo en tu navegador)";
    img.src = urlVista;
    marco.append(img);
  } else {
    const d = document.createElement("div");
    d.className = "sinvista";
    d.textContent =
      "Tu navegador no sabe enseñar fotos HEIC, pero la hemos analizado igual.";
    marco.append(d);
  }

  // Reinicia la caída de la polaroid y el flash
  const foto = $("foto");
  foto.classList.remove("cae");
  void foto.offsetWidth;
  foto.classList.add("cae");
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
  $("intro").textContent = "Esto es lo que esta foto le cuenta a quien la reciba:";
  $("mapa").classList.add("oculto");
  $("mapa").onclick = null;
  $("descargar").disabled = false;
  $("descargar").textContent = "Quitar todo y descargar";
  $("nota").textContent = "";
  ponerVista(archivo, bytes);

  const lat = info?.latitud;
  const lon = info?.longitud;
  const hayUbic = lat !== undefined && lon !== undefined;
  const movil = info ? [info.marca, info.modelo].filter(Boolean).join(" ") : "";
  const fecha = info?.fecha ? partirFecha(info.fecha) : "";

  $("lista").replaceChildren(
    linea("La hiciste con ", movil, ".", "No dice con qué móvil se hizo.", "medio"),
    linea("La hiciste el ", fecha, ".", "No lleva fecha ni hora.", "medio"),
    linea(
      "Estabas en las coordenadas ",
      hayUbic ? `${lat.toFixed(5)}, ${lon.toFixed(5)}` : "",
      ".",
      "No lleva ubicación.",
      "alto"
    )
  );

  if (hayUbic) {
    resumen(
      "Con esto, cualquiera que reciba la foto tal cual puede saber dónde estabas, con margen de metros.",
      "alto"
    );
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
    resumen("No lleva ubicación, pero sí cuenta con qué móvil y cuándo la hiciste.", "");
  } else {
    resumen("No hemos encontrado datos ocultos legibles en esta foto.", "");
    $("nota").textContent =
      "Si el archivo no es un JPG o un HEIC válido, al limpiar te avisaremos.";
  }

  $("descargar").onclick = () => descargar(archivo, bytes);

  $("resultado").scrollIntoView({ behavior: "smooth", block: "center" });
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

  // Rotulador negro: primero se tapa, luego se sustituye el texto de verdad
  document.querySelectorAll("#lista .dato").forEach((s) => {
    const largo = Math.min(Math.max(s.textContent.length, 8), 24);
    s.classList.add("tachado");
    setTimeout(() => (s.textContent = "x".repeat(largo)), 700);
  });

  $("intro").textContent = "Esto es lo que ya no podrá contar:";
  $("mapa").classList.add("oculto");
  $("descargar").textContent = "Descargada ✓";
  $("descargar").disabled = true;
  resumen("Copia limpia descargada. Envía esa, no la original.", "limpio");
  $("nota").textContent =
    "La original sigue intacta en tu dispositivo: bórrala si ya no la necesitas.";
}
