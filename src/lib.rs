pub mod formatos;
pub mod heic;
pub mod limpieza;

use std::io::Cursor;

use anyhow::{Context, Result};
use exif::{Exif, In, Reader, Tag, Value};

#[derive(Debug)]
pub struct Revelacion {
    pub marca: Option<String>,
    pub modelo: Option<String>,
    pub fecha: Option<String>,
    pub latitud: Option<f64>,
    pub longitud: Option<f64>,
}

/// Convierte grados, minutos y segundos a grados decimales.
/// Sur y Oeste son negativos.
fn dms_a_decimal(grados: f64, minutos: f64, segundos: f64, referencia: &str) -> f64 {
    let valor = grados + minutos / 60.0 + segundos / 3600.0;
    if referencia == "S" || referencia == "W" {
        -valor
    } else {
        valor
    }
}

fn texto(exif: &Exif, tag: Tag) -> Option<String> {
    let campo = exif.get_field(tag, In::PRIMARY)?;
    match &campo.value {
        Value::Ascii(valores) => valores
            .first()
            .map(|v| String::from_utf8_lossy(v).trim().to_string()),
        _ => None,
    }
}

fn grados_decimales(exif: &Exif, tag: Tag, tag_ref: Tag) -> Option<f64> {
    let campo = exif.get_field(tag, In::PRIMARY)?;
    let referencia = texto(exif, tag_ref)?;
    match &campo.value {
        Value::Rational(v) if v.len() >= 3 => Some(dms_a_decimal(
            v[0].to_f64(),
            v[1].to_f64(),
            v[2].to_f64(),
            &referencia,
        )),
        _ => None,
    }
}

/// Lee los metadatos de una foto que ya está en memoria.
pub fn analizar_bytes(datos: &[u8]) -> Result<Revelacion> {
    let mut lector = Cursor::new(datos);
    let exif = Reader::new()
        .read_from_container(&mut lector)
        .context("La foto no tiene metadatos EXIF legibles")?;

    Ok(Revelacion {
        marca: texto(&exif, Tag::Make),
        modelo: texto(&exif, Tag::Model),
        fecha: texto(&exif, Tag::DateTimeOriginal),
        latitud: grados_decimales(&exif, Tag::GPSLatitude, Tag::GPSLatitudeRef),
        longitud: grados_decimales(&exif, Tag::GPSLongitude, Tag::GPSLongitudeRef),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn norte_y_este_son_positivos() {
        // 40° 25' 1" N (latitud aproximada de la Puerta del Sol, Madrid)
        let lat = dms_a_decimal(40.0, 25.0, 1.0, "N");
        assert!((lat - 40.416944).abs() < 1e-5);
    }

    #[test]
    fn oeste_es_negativo() {
        // 3° 42' 12" W (longitud aproximada de la Puerta del Sol)
        let lon = dms_a_decimal(3.0, 42.0, 12.0, "W");
        assert!((lon + 3.703333).abs() < 1e-5);
    }

    #[test]
    fn sur_es_negativo() {
        // 33° 51' 54" S = -33.865
        let lat = dms_a_decimal(33.0, 51.0, 54.0, "S");
        assert!((lat + 33.865).abs() < 1e-9);
    }
}
