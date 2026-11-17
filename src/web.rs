//! Capa para el navegador (WebAssembly). Solo se compila con `--features web`.

use wasm_bindgen::prelude::*;

use crate::{analizar_bytes, formatos};

/// Lo que cuenta una foto, listo para leer desde JavaScript.
#[wasm_bindgen]
pub struct Revelado {
    marca: Option<String>,
    modelo: Option<String>,
    fecha: Option<String>,
    latitud: Option<f64>,
    longitud: Option<f64>,
}

#[wasm_bindgen]
impl Revelado {
    #[wasm_bindgen(getter)]
    pub fn marca(&self) -> Option<String> {
        self.marca.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn modelo(&self) -> Option<String> {
        self.modelo.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn fecha(&self) -> Option<String> {
        self.fecha.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn latitud(&self) -> Option<f64> {
        self.latitud
    }

    #[wasm_bindgen(getter)]
    pub fn longitud(&self) -> Option<f64> {
        self.longitud
    }
}

/// Una copia limpia de la foto y la extensión que le corresponde.
#[wasm_bindgen]
pub struct Limpio {
    datos: Vec<u8>,
    extension: String,
}

#[wasm_bindgen]
impl Limpio {
    #[wasm_bindgen(getter)]
    pub fn datos(&self) -> Vec<u8> {
        self.datos.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn extension(&self) -> String {
        self.extension.clone()
    }
}

fn a_error_js(e: anyhow::Error) -> JsError {
    JsError::new(&format!("{e:#}"))
}

/// Lee los metadatos de una foto.
#[wasm_bindgen]
pub fn revelar(datos: &[u8]) -> Result<Revelado, JsError> {
    let r = analizar_bytes(datos).map_err(a_error_js)?;
    Ok(Revelado {
        marca: r.marca,
        modelo: r.modelo,
        fecha: r.fecha,
        latitud: r.latitud,
        longitud: r.longitud,
    })
}

/// Devuelve una copia de la foto sin metadatos.
#[wasm_bindgen]
pub fn limpiar(datos: &[u8]) -> Result<Limpio, JsError> {
    let (limpio, extension) = formatos::limpiar(datos).map_err(a_error_js)?;
    Ok(Limpio {
        datos: limpio,
        extension: extension.to_string(),
    })
}
