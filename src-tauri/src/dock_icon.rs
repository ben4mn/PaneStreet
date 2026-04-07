use objc2::{AnyThread, MainThreadMarker};
use objc2_app_kit::{NSApplication, NSImage};
use objc2_foundation::NSData;

/// Set the macOS dock icon from raw RGBA pixel data.
#[tauri::command]
pub fn set_dock_icon(rgba: Vec<u8>, width: u32, height: u32) -> Result<(), String> {
    let png_data = rgba_to_png(&rgba, width, height).map_err(|e| e.to_string())?;

    // We're called from the main thread (Tauri commands run on the main thread on macOS)
    let mtm = unsafe { MainThreadMarker::new_unchecked() };

    unsafe {
        let data = NSData::with_bytes(&png_data);
        let image = NSImage::initWithData(NSImage::alloc(), &data)
            .ok_or_else(|| "Failed to create NSImage from PNG data".to_string())?;
        let app = NSApplication::sharedApplication(mtm);
        app.setApplicationIconImage(Some(&image));
    }

    Ok(())
}

/// Encode RGBA pixels as a minimal PNG.
fn rgba_to_png(rgba: &[u8], width: u32, height: u32) -> Result<Vec<u8>, String> {
    use std::io::Write;

    let expected = (width * height * 4) as usize;
    if rgba.len() != expected {
        return Err(format!(
            "RGBA data length {} doesn't match {}x{}x4={}",
            rgba.len(), width, height, expected
        ));
    }

    let mut out = Vec::new();

    // PNG signature
    out.write_all(&[137, 80, 78, 71, 13, 10, 26, 10]).unwrap();

    // IHDR chunk
    let mut ihdr = Vec::new();
    ihdr.extend_from_slice(&width.to_be_bytes());
    ihdr.extend_from_slice(&height.to_be_bytes());
    ihdr.push(8); // bit depth
    ihdr.push(6); // color type: RGBA
    ihdr.push(0); // compression
    ihdr.push(0); // filter
    ihdr.push(0); // interlace
    write_chunk(&mut out, b"IHDR", &ihdr);

    // IDAT chunk — build raw scanlines with filter byte 0 (None) per row
    let row_bytes = (width * 4) as usize;
    let mut raw_data = Vec::with_capacity((1 + row_bytes) * height as usize);
    for y in 0..height as usize {
        raw_data.push(0); // filter: None
        let start = y * row_bytes;
        raw_data.extend_from_slice(&rgba[start..start + row_bytes]);
    }

    // Compress with deflate (zlib)
    let compressed = miniz_deflate(&raw_data);
    write_chunk(&mut out, b"IDAT", &compressed);

    // IEND chunk
    write_chunk(&mut out, b"IEND", &[]);

    Ok(out)
}

fn write_chunk(out: &mut Vec<u8>, chunk_type: &[u8; 4], data: &[u8]) {
    let len = data.len() as u32;
    out.extend_from_slice(&len.to_be_bytes());
    out.extend_from_slice(chunk_type);
    out.extend_from_slice(data);
    let mut crc_data = Vec::with_capacity(4 + data.len());
    crc_data.extend_from_slice(chunk_type);
    crc_data.extend_from_slice(data);
    let crc = crc32(&crc_data);
    out.extend_from_slice(&crc.to_be_bytes());
}

fn crc32(data: &[u8]) -> u32 {
    let mut crc: u32 = 0xFFFFFFFF;
    for &byte in data {
        crc ^= byte as u32;
        for _ in 0..8 {
            if crc & 1 != 0 {
                crc = (crc >> 1) ^ 0xEDB88320;
            } else {
                crc >>= 1;
            }
        }
    }
    !crc
}

/// Minimal zlib deflate using store-only blocks (no compression).
/// Produces valid zlib stream for PNG decoding.
fn miniz_deflate(data: &[u8]) -> Vec<u8> {
    let mut out = Vec::new();
    // Zlib header: CM=8 (deflate), CINFO=7 (32K window), FCHECK
    out.push(0x78);
    out.push(0x01);

    // Split into 65535-byte store blocks
    let chunks: Vec<&[u8]> = data.chunks(65535).collect();
    for (i, chunk) in chunks.iter().enumerate() {
        let is_last = i == chunks.len() - 1;
        out.push(if is_last { 0x01 } else { 0x00 }); // BFINAL + BTYPE=00 (stored)
        let len = chunk.len() as u16;
        let nlen = !len;
        out.extend_from_slice(&len.to_le_bytes());
        out.extend_from_slice(&nlen.to_le_bytes());
        out.extend_from_slice(chunk);
    }

    // Adler-32 checksum
    let adler = adler32(data);
    out.extend_from_slice(&adler.to_be_bytes());

    out
}

fn adler32(data: &[u8]) -> u32 {
    let mut a: u32 = 1;
    let mut b: u32 = 0;
    for &byte in data {
        a = (a + byte as u32) % 65521;
        b = (b + a) % 65521;
    }
    (b << 16) | a
}
