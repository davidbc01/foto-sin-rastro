use std::io::Cursor;

use anyhow::{bail, Result};
use exif::{In, Reader, Tag};

const SOI: [u8; 2] = [0xFF, 0xD8];

/// Lee la orientación de la foto (1 = normal, 6 = girada 90°, etc.).
fn leer_orientacion(datos: &[u8]) -> Option<u16> {
    let exif = Reader::new()
        .read_from_container(&mut Cursor::new(datos))
        .ok()?;
    let campo = exif.get_field(Tag::Orientation, In::PRIMARY)?;
    campo.value.get_uint(0).map(|v| v as u16)
}

/// Un bloque EXIF mínimo que solo contiene la orientación.
fn exif_minimo(orientacion: u16) -> Vec<u8> {
    let mut v = vec![0xFF, 0xE1, 0x00, 0x22]; // marcador APP1 + longitud (34)
    v.extend_from_slice(b"Exif\0\0");
    v.extend_from_slice(&[0x4D, 0x4D, 0x00, 0x2A, 0x00, 0x00, 0x00, 0x08]); // cabecera TIFF
    v.extend_from_slice(&[0x00, 0x01]); // una sola entrada
    v.extend_from_slice(&[0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01]); // etiqueta Orientation
    v.extend_from_slice(&orientacion.to_be_bytes());
    v.extend_from_slice(&[0x00, 0x00]); // relleno del campo de valor
    v.extend_from_slice(&[0x00, 0x00, 0x00, 0x00]); // sin más bloques
    v
}

/// Indica si un bloque del JPG contiene metadatos que hay que quitar.
fn debe_eliminarse(marcador: u8, contenido: &[u8]) -> bool {
    match marcador {
        0xE1 => {
            contenido.starts_with(b"Exif\0\0")
                || contenido.starts_with(b"http://ns.adobe.com/xap/1.0/\0")
                || contenido.starts_with(b"http://ns.adobe.com/xmp/extension/\0")
        }
        0xED => true, // IPTC / Photoshop
        0xFE => true, // comentarios
        _ => false,
    }
}

/// Devuelve una copia del JPG sin metadatos, sin tocar los píxeles.
/// Conserva únicamente la orientación para que la foto no se vea girada.
pub fn limpiar_jpeg(datos: &[u8]) -> Result<Vec<u8>> {
    if datos.len() < 4 || datos[..2] != SOI {
        bail!("El fichero no es un JPG válido");
    }

    let orientacion = leer_orientacion(datos);

    let mut salida = Vec::with_capacity(datos.len());
    salida.extend_from_slice(&SOI);
    if let Some(o) = orientacion {
        if o != 1 {
            salida.extend_from_slice(&exif_minimo(o));
        }
    }

    let mut i = 2;
    loop {
        if i + 4 > datos.len() || datos[i] != 0xFF {
            bail!("Estructura de JPG inesperada");
        }
        let marcador = datos[i + 1];

        // Bytes de relleno antes de un marcador
        if marcador == 0xFF {
            i += 1;
            continue;
        }

        // Empiezan los datos de la imagen: se copia todo lo que queda tal cual
        if marcador == 0xDA {
            salida.extend_from_slice(&datos[i..]);
            return Ok(salida);
        }

        let longitud = u16::from_be_bytes([datos[i + 2], datos[i + 3]]) as usize;
        let fin = i + 2 + longitud;
        if longitud < 2 || fin > datos.len() {
            bail!("Bloque de JPG con longitud incorrecta");
        }

        let segmento = &datos[i..fin];
        if !debe_eliminarse(marcador, &segmento[4..]) {
            salida.extend_from_slice(segmento);
        }
        i = fin;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn jpg_de_prueba() -> Vec<u8> {
        let mut v = vec![0xFF, 0xD8];
        // APP1 Exif falso (debe eliminarse)
        v.extend_from_slice(&[0xFF, 0xE1, 0x00, 0x0C]);
        v.extend_from_slice(b"Exif\0\0");
        v.extend_from_slice(&[1, 2, 3, 4]);
        // Bloque de tablas (debe conservarse)
        v.extend_from_slice(&[0xFF, 0xDB, 0x00, 0x04, 0xAA, 0xBB]);
        // Comentario (debe eliminarse)
        v.extend_from_slice(&[0xFF, 0xFE, 0x00, 0x05, b'h', b'o', b'l']);
        // Inicio de imagen + datos + fin
        v.extend_from_slice(&[0xFF, 0xDA, 0x00, 0x02, 0x11, 0x22, 0xFF, 0xD9]);
        v
    }

    #[test]
    fn quita_exif_y_comentarios_pero_conserva_la_imagen() {
        let limpio = limpiar_jpeg(&jpg_de_prueba()).unwrap();
        assert_eq!(
            limpio,
            vec![
                0xFF, 0xD8, 0xFF, 0xDB, 0x00, 0x04, 0xAA, 0xBB, 0xFF, 0xDA, 0x00, 0x02, 0x11,
                0x22, 0xFF, 0xD9
            ]
        );
    }

    #[test]
    fn rechaza_ficheros_que_no_son_jpg() {
        assert!(limpiar_jpeg(b"esto no es una foto").is_err());
    }

    #[test]
    fn conserva_solo_la_orientacion() {
        let mut jpg = vec![0xFF, 0xD8];
        jpg.extend_from_slice(&exif_minimo(6));
        jpg.extend_from_slice(&[0xFF, 0xDB, 0x00, 0x04, 0xAA, 0xBB]);
        jpg.extend_from_slice(&[0xFF, 0xDA, 0x00, 0x02, 0x11, 0x22, 0xFF, 0xD9]);

        assert_eq!(leer_orientacion(&jpg), Some(6));

        let limpio = limpiar_jpeg(&jpg).unwrap();
        assert_eq!(leer_orientacion(&limpio), Some(6));
    }
}
