<p align="center">
    <img src="web/icono.svg" alt="foto-sin-rastro" width="96">
</p>

# foto-sin-rastro

[![CI](https://github.com/davidbc01/foto-sin-rastro/actions/workflows/ci.yml/badge.svg)](https://github.com/davidbc01/foto-sin-rastro/actions/workflows/ci.yml)

> Tu foto cuenta más de lo que crees.

Las fotos que haces con el móvil llevan datos ocultos: el modelo del teléfono, la fecha y la hora exactas y, si tenías la ubicación activada, **dónde estabas con precisión de metros**. Al compartir la foto original, esos datos viajan con ella.

`foto-sin-rastro` hace dos cosas:

1. **Te enseña** lo que cuenta tu foto.
2. **Te da una copia limpia**, sin esos datos.

Todo ocurre en tu dispositivo y no se sube nada. Puedes usarlo [en la web](https://davidbc01.github.io/foto-sin-rastro/) o como programa de línea de comandos.

## Pruébalo sin instalar nada

**[davidbc01.github.io/foto-sin-rastro](https://davidbc01.github.io/foto-sin-rastro/)**: arrastra una foto y mira qué esconde. Funciona entera en tu navegador (el mismo código Rust, compilado a WebAssembly), así que la foto no se sube a ningún servidor.

## Ejemplo

```
$ sin-rastro foto.jpg
Lo que tu foto cuenta de ti
----------------------------
Móvil o cámara: Apple iPhone 15
Fecha: 03/05/2026 18:21:07
Ubicación: 40.416944, -3.703333
Mapa: https://www.openstreetmap.org/?mlat=40.416944&mlon=-3.703333#map=17/40.416944/-3.703333

$ sin-rastro limpiar foto.jpg
Foto limpia guardada en foto_limpia.jpg
```

El enlace del mapa es solo texto. Si lo abres en el navegador, tu navegador sí contacta con OpenStreetMap y le llegan esas coordenadas.

## Instalación del programa de línea de comandos

Necesitas [Rust](https://rustup.rs). Desde la carpeta del proyecto:

```
cargo install --path .
```

Esto instala el comando `sin-rastro`.

## Uso

```
sin-rastro <foto>              muestra lo que cuenta la foto
sin-rastro limpiar <foto>      guarda una copia sin metadatos
```

La copia limpia se guarda junto a la original con el sufijo `_limpia` (por ejemplo, `foto_limpia.jpg`). La original no se toca.

## Qué limpia

| Formato | Qué hace |
|---|---|
| JPG | Quita EXIF, XMP, IPTC y comentarios. Conserva la orientación (para que las fotos verticales no se vean tumbadas) y el perfil de color. No recomprime la imagen, así que no pierdes calidad. |
| HEIC | Vacía el EXIF y el XMP sin cambiar el tamaño del fichero. |

## Qué NO hace

Conviene ser claros con las limitaciones:

- **No toca los píxeles.** Lo que se ve en la imagen (una fachada, un cartel, un rostro) puede delatarte igualmente.
- **Solo JPG y HEIC.** Otros formatos (PNG, WebP, vídeo...) todavía no.
- **En HEIC solo vacía EXIF y XMP.** Otros lugares donde un móvil podría guardar datos, como miniaturas o mapas de profundidad, no se tocan.
- **No cambia el nombre ni las fechas del archivo** en tu sistema.
- **Está probado con pocas fotos.** Comprueba siempre el resultado: `sin-rastro foto_limpia.jpg` no debería mostrar nada.

Úsalo como una capa más de protección, no como una garantía absoluta.

## Privacidad

El programa de línea de comandos no usa la red y solo tiene dos dependencias (`anyhow` y `kamadak-exif`). Puedes comprobarlo leyendo el código y `Cargo.toml`.

La web ejecuta ese mismo código en tu navegador y la foto no se sube a ningún sitio. La capa para el navegador añade una dependencia más, `wasm-bindgen`, que solo se usa al compilar para WebAssembly. Lo único que contacta con otro servidor es el botón «Ver ese punto en un mapa», que abre OpenStreetMap, y solo si lo pulsas y aceptas el aviso.

## Desarrollo

```
cargo test
```

| Archivo | Qué hace |
|---|---|
| `src/lib.rs` | Lee los metadatos y convierte el GPS a coordenadas |
| `src/limpieza.rs` | Limpia JPG |
| `src/heic.rs` | Limpia HEIC |
| `src/formatos.rs` | Detecta el formato y elige cómo limpiar |
| `src/web.rs` | Capa para el navegador (WebAssembly) |
| `src/main.rs` | La línea de comandos |
| `web/index.html`, `web/app.js` | La página y su lógica |
| `web/src/estilos.css` | Estilos propios y tema de Tailwind |
| `scripts/iconos.mjs` | Genera el sprite con los iconos de Lucide |

### Desarrollo de la web

La web vive en `web/` y reutiliza el mismo código Rust compilado a WebAssembly, con Tailwind CSS y iconos de Lucide.

Necesitas Rust, el target de WebAssembly, `wasm-bindgen-cli` (con la misma versión que figure en `Cargo.lock`) y Node 22:

```
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.130
cargo build --lib --target wasm32-unknown-unknown --release --features web
wasm-bindgen --target web --out-dir web/pkg target/wasm32-unknown-unknown/release/foto_sin_rastro.wasm
npm install
npm run dev
```

La web queda en `http://localhost:3000`. Cada push a `master` la publica en GitHub Pages con la Action de `.github/workflows/pages.yml`.

## Licencia

[MIT](LICENSE)
