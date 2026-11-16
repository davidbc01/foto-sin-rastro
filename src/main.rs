use std::env;
use std::fs;

use anyhow::{Context, Result};
use foto_reveal::{analizar_bytes, Revelacion};

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

fn main() -> Result<()> {
    let ruta = env::args()
        .nth(1)
        .context("Uso: foto-reveal <ruta-de-la-foto>")?;

    let datos = fs::read(&ruta).with_context(|| format!("No se pudo abrir {ruta}"))?;
    let revelacion = analizar_bytes(&datos)?;

    mostrar(&revelacion);

    Ok(())
}
