use anyhow::{bail, Context, Result};

/// Una caja: cada uno de los bloques en los que se organiza un HEIC.
struct Caja {
    tipo: [u8; 4],
    contenido: usize, // dónde empieza el contenido (después de la cabecera)
    fin: usize,       // dónde termina la caja
}

/// Un elemento guardado dentro del HEIC (imagen, EXIF, XMP...).
struct Elemento {
    id: u32,
    tipo: [u8; 4],
    tipo_mime: String,
}

/// Dónde están guardados los datos de un elemento.
struct Ubicacion {
    id: u32,
    metodo: u8,
    tramos: Vec<(u64, u64)>, // (posición absoluta, longitud)
}

fn leer_u16(d: &[u8], pos: usize) -> Result<u16> {
    let b = d.get(pos..pos + 2).context("HEIC truncado")?;
    Ok(u16::from_be_bytes([b[0], b[1]]))
}

fn leer_u32(d: &[u8], pos: usize) -> Result<u32> {
    let b = d.get(pos..pos + 4).context("HEIC truncado")?;
    Ok(u32::from_be_bytes([b[0], b[1], b[2], b[3]]))
}

/// Lee un número de 0, 4 u 8 bytes (los tamaños que admite el formato).
fn leer_n(d: &[u8], pos: usize, bytes: usize) -> Result<u64> {
    match bytes {
        0 => Ok(0),
        4 => Ok(leer_u32(d, pos)? as u64),
        8 => {
            let b = d.get(pos..pos + 8).context("HEIC truncado")?;
            Ok(u64::from_be_bytes(b.try_into()?))
        }
        _ => bail!("Tamaño de campo no soportado en el HEIC"),
    }
}

/// Lee un texto terminado en cero y avanza la posición.
fn cadena(d: &[u8], pos: &mut usize, limite: usize) -> Result<String> {
    let resto = d.get(*pos..limite).context("HEIC truncado")?;
    let longitud = resto
        .iter()
        .position(|&b| b == 0)
        .context("Texto sin terminar en el HEIC")?;
    let texto = String::from_utf8_lossy(&resto[..longitud]).into_owned();
    *pos += longitud + 1;
    Ok(texto)
}

/// Recorre las cajas que hay entre `desde` y `hasta`.
fn cajas(d: &[u8], desde: usize, hasta: usize) -> Result<Vec<Caja>> {
    let mut resultado = Vec::new();
    let mut pos = desde;
    while pos < hasta {
        if pos + 8 > hasta {
            bail!("Caja del HEIC incompleta");
        }
        let tam32 = leer_u32(d, pos)? as u64;
        let tipo: [u8; 4] = d[pos + 4..pos + 8].try_into()?;
        let (cabecera, tam) = match tam32 {
            1 => (16usize, leer_n(d, pos + 8, 8)?),
            0 => (8usize, (hasta - pos) as u64),
            n => (8usize, n),
        };
        if tam < cabecera as u64 || tam > (hasta - pos) as u64 {
            bail!("Caja del HEIC con tamaño incorrecto");
        }
        resultado.push(Caja {
            tipo,
            contenido: pos + cabecera,
            fin: pos + tam as usize,
        });
        pos += tam as usize;
    }
    Ok(resultado)
}

fn buscar<'a>(lista: &'a [Caja], tipo: &[u8; 4]) -> Option<&'a Caja> {
    lista.iter().find(|c| &c.tipo == tipo)
}

fn leer_elementos(d: &[u8], iinf: &Caja) -> Result<Vec<Elemento>> {
    let version = *d.get(iinf.contenido).context("HEIC truncado")?;
    let inicio = iinf.contenido + if version == 0 { 6 } else { 8 };

    let mut elementos = Vec::new();
    for infe in cajas(d, inicio, iinf.fin)? {
        if &infe.tipo != b"infe" {
            continue;
        }
        let mut p = infe.contenido;
        let v = *d.get(p).context("HEIC truncado")?;
        p += 4;
        if v < 2 {
            continue; // versiones antiguas, sin tipo de elemento
        }
        let id = if v == 2 {
            let x = leer_u16(d, p)? as u32;
            p += 2;
            x
        } else {
            let x = leer_u32(d, p)?;
            p += 4;
            x
        };
        p += 2; // índice de protección
        let tipo: [u8; 4] = d.get(p..p + 4).context("HEIC truncado")?.try_into()?;
        p += 4;
        let _nombre = cadena(d, &mut p, infe.fin)?;
        let tipo_mime = if &tipo == b"mime" {
            cadena(d, &mut p, infe.fin)?
        } else {
            String::new()
        };
        elementos.push(Elemento { id, tipo, tipo_mime });
    }
    Ok(elementos)
}

fn leer_ubicaciones(d: &[u8], iloc: &Caja) -> Result<Vec<Ubicacion>> {
    let mut p = iloc.contenido;
    let version = *d.get(p).context("HEIC truncado")?;
    p += 4;

    let tamanos = *d.get(p).context("HEIC truncado")?;
    let tam_desplazamiento = (tamanos >> 4) as usize;
    let tam_longitud = (tamanos & 0x0F) as usize;
    p += 1;

    let tamanos2 = *d.get(p).context("HEIC truncado")?;
    let tam_base = (tamanos2 >> 4) as usize;
    let tam_indice = if version == 1 || version == 2 {
        (tamanos2 & 0x0F) as usize
    } else {
        0
    };
    p += 1;

    let total = if version < 2 {
        let n = leer_u16(d, p)? as u32;
        p += 2;
        n
    } else {
        let n = leer_u32(d, p)?;
        p += 4;
        n
    };

    let mut resultado = Vec::new();
    for _ in 0..total {
        let id = if version < 2 {
            let x = leer_u16(d, p)? as u32;
            p += 2;
            x
        } else {
            let x = leer_u32(d, p)?;
            p += 4;
            x
        };
        let metodo = if version == 1 || version == 2 {
            let x = leer_u16(d, p)?;
            p += 2;
            (x & 0x0F) as u8
        } else {
            0
        };
        p += 2; // referencia de datos
        let base = leer_n(d, p, tam_base)?;
        p += tam_base;
        let n_tramos = leer_u16(d, p)?;
        p += 2;

        let mut tramos = Vec::new();
        for _ in 0..n_tramos {
            p += tam_indice;
            let desplazamiento = leer_n(d, p, tam_desplazamiento)?;
            p += tam_desplazamiento;
            let longitud = leer_n(d, p, tam_longitud)?;
            p += tam_longitud;
            let inicio = base
                .checked_add(desplazamiento)
                .context("Posición incorrecta en el HEIC")?;
            tramos.push((inicio, longitud));
        }
        resultado.push(Ubicacion { id, metodo, tramos });
    }
    Ok(resultado)
}

/// Un bloque EXIF válido pero vacío, rellenado con ceros hasta `longitud`.
fn exif_vacio(longitud: usize) -> Vec<u8> {
    let mut minimo = vec![0, 0, 0, 6]; // desplazamiento hasta la cabecera TIFF
    minimo.extend_from_slice(b"Exif\0\0");
    minimo.extend_from_slice(&[0x4D, 0x4D, 0x00, 0x2A, 0x00, 0x00, 0x00, 0x08]); // cabecera TIFF
    minimo.extend_from_slice(&[0x00, 0x00]); // cero entradas
    minimo.extend_from_slice(&[0x00, 0x00, 0x00, 0x00]); // sin más bloques

    let mut v = vec![0u8; longitud];
    if longitud >= minimo.len() {
        v[..minimo.len()].copy_from_slice(&minimo);
    }
    v
}

/// Neutraliza el EXIF y el XMP de un HEIC sin cambiar el tamaño del fichero.
/// Devuelve el fichero limpio y cuántos bloques de metadatos se han vaciado.
pub fn limpiar_heic(datos: &[u8]) -> Result<(Vec<u8>, usize)> {
    if datos.len() < 12 || &datos[4..8] != b"ftyp" {
        bail!("El fichero no es un HEIC válido");
    }

    let raiz = cajas(datos, 0, datos.len())?;
    let meta = buscar(&raiz, b"meta").context("El HEIC no tiene bloque meta")?;
    let hijos = cajas(datos, meta.contenido + 4, meta.fin)?;
    let iinf = buscar(&hijos, b"iinf").context("El HEIC no tiene bloque iinf")?;
    let iloc = buscar(&hijos, b"iloc").context("El HEIC no tiene bloque iloc")?;

    let elementos = leer_elementos(datos, iinf)?;
    let ubicaciones = leer_ubicaciones(datos, iloc)?;

    let mut salida = datos.to_vec();
    let mut bloques = 0;

    for e in &elementos {
        let es_exif = &e.tipo == b"Exif";
        let es_xmp = &e.tipo == b"mime"
            && (e.tipo_mime.contains("xmp") || e.tipo_mime.contains("rdf+xml"));
        if !es_exif && !es_xmp {
            continue;
        }

        let ubicacion = ubicaciones
            .iter()
            .find(|u| u.id == e.id)
            .with_context(|| format!("No se encuentra dónde está guardado el elemento {}", e.id))?;
        if ubicacion.metodo != 0 {
            bail!("Este HEIC guarda los metadatos de una forma que aún no soportamos");
        }

        for (i, &(inicio, longitud)) in ubicacion.tramos.iter().enumerate() {
            let ini = usize::try_from(inicio)?;
            let lon = usize::try_from(longitud)?;
            let fin = ini
                .checked_add(lon)
                .filter(|&f| f <= salida.len())
                .context("Bloque de metadatos fuera del fichero")?;

            let nuevo = if es_exif && i == 0 {
                exif_vacio(lon)
            } else if es_exif {
                vec![0u8; lon]
            } else {
                vec![b' '; lon]
            };
            salida[ini..fin].copy_from_slice(&nuevo);
        }
        bloques += 1;
    }

    Ok((salida, bloques))
}

#[cfg(test)]
mod tests {
    use super::*;

    const LONGITUD_EXIF: usize = 40;

    fn caja(tipo: &[u8; 4], contenido: &[u8]) -> Vec<u8> {
        let mut v = ((contenido.len() + 8) as u32).to_be_bytes().to_vec();
        v.extend_from_slice(tipo);
        v.extend_from_slice(contenido);
        v
    }

    /// Construye un HEIC mínimo con un bloque EXIF "secreto" y una imagen falsa.
    /// Devuelve el fichero, dónde empieza el EXIF y dónde empieza la imagen.
    fn heic_de_prueba() -> (Vec<u8>, usize, usize) {
        let ftyp = caja(b"ftyp", b"heic\0\0\0\0mif1heic");

        let mut infe1 = vec![2, 0, 0, 0, 0, 1, 0, 0];
        infe1.extend_from_slice(b"Exif");
        infe1.push(0);
        let mut infe2 = vec![2, 0, 0, 0, 0, 2, 0, 0];
        infe2.extend_from_slice(b"hvc1");
        infe2.push(0);
        let mut iinf_c = vec![0, 0, 0, 0, 0, 2];
        iinf_c.extend(caja(b"infe", &infe1));
        iinf_c.extend(caja(b"infe", &infe2));
        let iinf = caja(b"iinf", &iinf_c);

        let construir_meta = |off_exif: u32, off_img: u32| -> Vec<u8> {
            let mut iloc_c = vec![1, 0, 0, 0, 0x44, 0x00, 0, 2];
            iloc_c.extend_from_slice(&[0, 1, 0, 0, 0, 0, 0, 1]);
            iloc_c.extend_from_slice(&off_exif.to_be_bytes());
            iloc_c.extend_from_slice(&(LONGITUD_EXIF as u32).to_be_bytes());
            iloc_c.extend_from_slice(&[0, 2, 0, 0, 0, 0, 0, 1]);
            iloc_c.extend_from_slice(&off_img.to_be_bytes());
            iloc_c.extend_from_slice(&10u32.to_be_bytes());
            let mut meta_c = vec![0, 0, 0, 0];
            meta_c.extend(iinf.clone());
            meta_c.extend(caja(b"iloc", &iloc_c));
            caja(b"meta", &meta_c)
        };

        let tam_meta = construir_meta(0, 0).len();
        let inicio_exif = ftyp.len() + tam_meta + 8;
        let inicio_imagen = inicio_exif + LONGITUD_EXIF;
        let meta = construir_meta(inicio_exif as u32, inicio_imagen as u32);

        let mut exif = vec![0, 0, 0, 6];
        exif.extend_from_slice(b"Exif\0\0");
        exif.extend_from_slice(b"MM\0*\0\0\0\x08");
        let faltan = LONGITUD_EXIF - exif.len();
        exif.extend(b"SECRETOSECRETOSECRETOSECRETO".iter().take(faltan));
        assert_eq!(exif.len(), LONGITUD_EXIF);

        let mut mdat_c = exif;
        mdat_c.extend_from_slice(&[0xAB; 10]);

        let mut fichero = ftyp;
        fichero.extend(meta);
        fichero.extend(caja(b"mdat", &mdat_c));
        (fichero, inicio_exif, inicio_imagen)
    }

    #[test]
    fn vacia_el_exif_sin_cambiar_el_tamano_ni_la_imagen() {
        let (heic, inicio_exif, inicio_imagen) = heic_de_prueba();
        assert!(heic.windows(7).any(|w| w == b"SECRETO"));

        let (limpio, bloques) = limpiar_heic(&heic).unwrap();

        assert_eq!(bloques, 1);
        assert_eq!(limpio.len(), heic.len());
        assert!(!limpio.windows(7).any(|w| w == b"SECRETO"));
        assert_eq!(&limpio[inicio_exif..inicio_exif + 8], &[0, 0, 0, 6, b'E', b'x', b'i', b'f']);
        assert_eq!(&limpio[inicio_imagen..inicio_imagen + 10], &[0xAB; 10]);
        // Todo lo que está antes del EXIF (cajas ftyp y meta) queda intacto
        assert_eq!(&limpio[..inicio_exif], &heic[..inicio_exif]);
    }

    #[test]
    fn rechaza_ficheros_que_no_son_heic() {
        assert!(limpiar_heic(b"esto no es una foto heic").is_err());
    }

    #[test]
    fn rechaza_un_heic_truncado() {
        let (heic, _, _) = heic_de_prueba();
        assert!(limpiar_heic(&heic[..40]).is_err());
    }
}
