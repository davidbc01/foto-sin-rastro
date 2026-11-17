use std::env;
use std::fs;
use std::path::Path;

use anyhow::{Context, Result, bail};
use foto_sin_rastro::formatos::limpiar as limpiar_foto;
use foto_sin_rastro::{Revelacion, analizar_bytes};

fn mostrar(r: &Revelacion) {
    println!("Lo que tu foto cuenta de ti");
    println!("----------------------------");
    println!(
        "Móvil o cámara: {} {}",
        r.marca.as_deref().unwrap_or("?"),
        r.modelo.as_deref().unwrap_or("?")
    );
    println!("Fecha: {}", r.fecha.as_deref().unwrap_or("no consta"));

    match (r.latitud, r.longitud) {
        (Some(lat), Some(lon)) => {
            println!("Ubicación: {lat:.6}, {lon:.6}");
            println!(
                "Mapa: https://www.openstreetmap.org/?mlat={lat:.6}&mlon={lon:.6}#map=17/{lat:.6}/{lon:.6}"
            );
        }
        _ => println!("Ubicación: no consta (la foto no tiene GPS)"),
    }
}

fn revelar(ruta: &str) -> Result<()> {
    let datos = fs::read(ruta).with_context(|| format!("No se pudo abrir {ruta}"))?;
    mostrar(&analizar_bytes(&datos)?);
    Ok(())
}

fn limpiar(ruta: &str) -> Result<()> {
    let datos = fs::read(ruta).with_context(|| format!("No se pudo abrir {ruta}"))?;
    let (limpio, extension) = limpiar_foto(&datos)?;

    let origen = Path::new(ruta);
    let nombre = origen
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("foto");
    let destino = origen.with_file_name(format!("{nombre}_limpia.{extension}"));

    fs::write(&destino, limpio)
        .with_context(|| format!("No se pudo guardar {}", destino.display()))?;
    println!("Foto limpia guardada en {}", destino.display());
    Ok(())
}

fn main() -> Result<()> {
    let args: Vec<String> = env::args().skip(1).collect();
    match args.as_slice() {
        [ruta] => revelar(ruta),
        [orden, ruta] if orden == "limpiar" => limpiar(ruta),
        _ => bail!(
            "Uso:\n  sin-rastro <foto>                muestra lo que cuenta la foto\n  sin-rastro limpiar <foto>        guarda una copia sin metadatos (JPG o HEIC)"
        ),
    }
}
