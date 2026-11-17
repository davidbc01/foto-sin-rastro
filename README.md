# foto-sin-rastro

> Tu foto cuenta más de lo que crees.

Las fotos que haces con el móvil llevan datos ocultos: el modelo del teléfono, la fecha y la hora exactas y, si tenías la ubicación activada, **dónde estabas con precisión de metros**. Al compartir la foto original, esos datos viajan con ella.

`foto-sin-rastro` hace dos cosas:

1. **Te enseña** lo que cuenta tu foto.
2. **Te da una copia limpia**, sin esos datos.

Todo ocurre en tu ordenador. El programa no usa la red.

## Ejemplo

```
$ sin-rastro foto.jpg
Lo que tu foto cuenta de ti
----------------------------
Móvil o cámara: Apple iPhone 15
Fecha: 2026:05:03 18:21:07
Ubicación: 40.416944, -3.703333
Mapa: https://www.openstreetmap.org/?mlat=40.416944&mlon=-3.703333#map=17/40.416944/-3.703333

$ sin-rastro limpiar foto.jpg
Foto limpia guardada en foto_limpia.jpg
```

El enlace del mapa es solo texto. Si lo abres en el navegador, tu navegador sí contacta con OpenStreetMap y le llegan esas coordenadas.

## Instalación

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

El programa no usa la red y solo tiene dos dependencias (`anyhow` y `kamadak-exif`). Puedes comprobarlo leyendo el código y `Cargo.toml`.

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
| `src/main.rs` | La línea de comandos |

## Licencia

[MIT](LICENSE)
