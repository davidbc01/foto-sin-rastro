const $ = (id) => document.getElementById(id);
const raiz = document.documentElement;
const zona = $("zona");
const entrada = $("archivo");
const SVG_NS = "http://www.w3.org/2000/svg";

let motor = null; // el módulo de Rust (WebAssembly), cuando está cargado
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

// Enlaces internos sin "#algo" en la dirección
const comportamiento = () =>
  matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";

document.querySelectorAll("[data-ir]").forEach((enlace) => {
  enlace.addEventListener("click", (e) => {
    e.preventDefault();
    $(enlace.dataset.ir)?.scrollIntoView({ behavior: comportamiento() });
  });
});
document.querySelectorAll("[data-arriba]").forEach((enlace) => {
  enlace.addEventListener("click", (e) => {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: comportamiento() });
  });
});

// Las secciones aparecen al hacer scroll
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
const marcarBarra = () => barra.toggleAttribute("data-sombra", window.scrollY > 8);
window.addEventListener("scroll", marcarBarra, { passive: true });
marcarBarra();

// ---------- motor Rust (WebAssembly) ----------
try {
  const modulo = await import("./pkg/foto_sin_rastro.js");
  await modulo.default();
  motor = modulo;
  const v = "v" + modulo.version();
  document.querySelectorAll(".ver").forEach((el) => (el.textContent = v));
} catch (error) {
  console.error("No se pudo cargar el motor:", error);
  $("zona-texto").textContent =
    "No se pudo cargar el programa. Recarga la página; si sigue igual, avísanos.";
}

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

// Icono de Lucide desde el sprite (iconos.svg)
function icono(nombre, clases) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", clases);
  svg.setAttribute("aria-hidden", "true");
  const uso = document.createElementNS(SVG_NS, "use");
  uso.setAttribute("href", `iconos.svg#${nombre}`);
  svg.append(uso);
  return svg;
}

// Siempre textContent: los metadatos de una foto no son de fiar.
function linea(nombreIcono, prefijo, dato, sufijo, vacio, nivel, orden) {
  const li = document.createElement("li");
  li.className =
    "flex items-start gap-3 border-b border-linea py-4 text-[1.08rem] leading-[1.6] motion-safe:animate-aparece";
  li.style.animationDelay = `${0.55 + orden * 0.25}s`;

  const texto = document.createElement("span");
  if (dato) {
    li.dataset.nivel = nivel;
    const s = document.createElement("span");
    s.className = "dato";
    s.textContent = dato;
    texto.append(prefijo, s, sufijo);
  } else {
    li.classList.add("text-suave");
    texto.textContent = vacio;
  }
  li.append(icono(nombreIcono, "icono mt-1.5 size-5 text-suave"), texto);
  return li;
}

function resumen(texto, tipo) {
  const r = $("resumen");
  const color =
    tipo === "alto" ? " font-semibold text-aviso" : tipo === "limpio" ? " font-semibold text-limpio" : "";
  r.className = "mb-6 text-[1.02rem] motion-safe:animate-aparece" + color;
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
    d.textContent = "Tu navegador no sabe enseñar fotos HEIC, pero la hemos analizado igual.";
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
  if (!motor) {
    $("zona-texto").textContent = "El programa no está cargado todavía. Recarga la página.";
    return;
  }
  const bytes = new Uint8Array(await archivo.arrayBuffer());

  let info = null;
  try {
    info = motor.revelar(bytes);
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
  $("descargar-texto").textContent = "Quitar todo y descargar";
  $("descargar-icono").setAttribute("href", "iconos.svg#eraser");
  $("nota").textContent = "";
  ponerVista(archivo, bytes);

  const lat = info?.latitud;
  const lon = info?.longitud;
  const hayUbic = lat !== undefined && lon !== undefined;
  const movil = info ? [info.marca, info.modelo].filter(Boolean).join(" ") : "";
  const fecha = info?.fecha ? partirFecha(info.fecha) : "";

  $("lista").replaceChildren(
    linea("smartphone", "La hiciste con ", movil, ".", "No dice con qué móvil se hizo.", "medio", 0),
    linea("clock", "La hiciste el ", fecha, ".", "No lleva fecha ni hora.", "medio", 1),
    linea(
      "map-pin",
      "Estabas en las coordenadas ",
      hayUbic ? `${lat.toFixed(5)}, ${lon.toFixed(5)}` : "",
      ".",
      "No lleva ubicación.",
      "alto",
      2
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
    $("nota").textContent = "Si el archivo no es un JPG o un HEIC válido, al limpiar te avisaremos.";
  }

  $("descargar").onclick = () => descargar(archivo, bytes);

  $("resultado").scrollIntoView({ behavior: comportamiento(), block: "center" });
}

// ---------- limpieza ----------
function descargar(archivo, bytes) {
  let limpio;
  try {
    limpio = motor.limpiar(bytes);
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
  $("descargar-texto").textContent = "Descargada";
  $("descargar-icono").setAttribute("href", "iconos.svg#check");
  $("descargar").disabled = true;
  resumen("Copia limpia descargada. Envía esa, no la original.", "limpio");
  $("nota").textContent = "La original sigue intacta en tu dispositivo: bórrala si ya no la necesitas.";
}
