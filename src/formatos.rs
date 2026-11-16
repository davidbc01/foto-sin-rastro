use anyhow::{bail, Result};

use crate::heic::limpiar_heic;
use crate::limpieza::limpiar_jpeg;

/// Detecta el formato de la foto y devuelve una copia limpia con la extensión que le toca.
pub fn limpiar(datos: &[u8]) -> Result<(Vec<u8>, &'static str)> {
    if datos.starts_with(&[0xFF, 0xD8]) {
        Ok((limpiar_jpeg(datos)?, "jpg"))
    } else if datos.len() >= 12 && &datos[4..8] == b"ftyp" {
        let extension = match &datos[8..12] {
            b"avif" | b"avis" => "avif",
            _ => "heic",
        };
        let (limpio, _bloques) = limpiar_heic(datos)?;
        Ok((limpio, extension))
    } else {
        bail!("Formato no soportado: de momento solo JPG y HEIC")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rechaza_formatos_desconocidos() {
        assert!(limpiar(b"esto no es una foto").is_err());
    }
}
