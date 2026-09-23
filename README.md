# Ladder Diagram PLC - Camera Inspection 3K6Y

Repository ini berisi program PLC Ladder Diagram yang diekspor dari **Mitsubishi GX Works 2** untuk mesin **Camera Inspection 3K6Y (v1.9)**.

## 🌐 Web Ladder Diagram Viewer (Online & Offline)

Anda dapat melihat seluruh diagram tangga (*ladder diagram*) visual persis seperti tampilan di GX Works 2 langsung melalui web browser:

- **Buka Lokal**: Cukup klik 2x file [`index.html`](file:///d:/02%20PLC%20HMI%20PROG/3K6Y%20CAMERA%20INSPECTION/github/ld-plc-3k6y/index.html) di komputer Anda.
- **GitHub Pages (Live)**: `https://sirojulkahfi.github.io/ld-plc-3k6y/` *(setelah diaktifkan di Settings > Pages > branch `main`)*.

### Fitur Web Viewer:
1. **Diagram Grafis SVG Presisi**: Kontak NO `--[ ]--`, NC `--[/]--`, Pulse `--[↑]--`, Coil `--( )--`, Function Block `-[MOV]-`, dan garis logika kontinu tanpa putus.
2. **Branching Asli GX Works 2**: Instruksi `MPS`, `MRD`, dan `MPP` otomatis dirender sebagai percabangan jalur vertikal, bukan kotak kontak.
3. **Pencarian & Cross-Reference (XRef)**: Klik nama device mana saja (misal `M900`, `X20`, `Y0`) untuk melihat semua lokasi pembacaan (input) dan penulisan (output).
4. **Lompat ke Step**: Ketik nomor langkah (Step No.) untuk langsung menuju rung terkait.
5. **Mode Tampilan**: Diagram Ladder grafis, *Instruction List / Mnemonic Table*, atau I/O Rack Hardware.
6. **Dark / Light Theme & Print to PDF**: Mendukung mode malam dan pencetakan langsung ke file PDF.

---

## 📌 Informasi PLC & Perangkat Keras

- **Tipe PLC**: Mitsubishi MELSEC Q Series - QCPU (Q mode) `Q04UDEH`
- **Software**: GX Works 2
- **Kamera Vision**: Keyence Vision System
- **Konfigurasi Modul (I/O Assignment)**:
  - **Slot 0 (0-0)**: Intelligent Function Module - `QD75D2N` (Positioning module, 32 pts, Start XY: 0)
  - **Slot 1 (0-1)**: Digital Input Module - `QX42` (64 pts DC Input, Start XY: 32)
  - **Slot 2 (0-2)**: Digital Output Module - `QY42P` (64 pts Transistor Output, Start XY: 96)
  - **Slot 3 (0-3)**: High-Speed Counter Module - `QD62` (16 pts, Start XY: 160)

---

## 🌐 Komunikasi Jaringan (IP Configuration)

| Perangkat | IP Address | Port / Keterangan |
| :--- | :--- | :--- |
| **PLC (Q04UDEH)** | `192.168.8.190` | Port MC Protocol: `5015` |
| **Camera (Keyence)** | `192.168.8.200` | Ethernet Vision Interface |

---

## 📂 Struktur & Deskripsi File Program

File-file CSV berikut merupakan ekspor instruksi ladder diagram dari GX Works 2:

1. **`ALARM.csv`**
   - Berisi logika kontrol alarm mesin Camera Inspection 3K6Y.
   - Mengatur deteksi fault, safety interlock, reset timer, dan status indikator alarm.

2. **`CAMERA.csv`**
   - Berisi logika komunikasi antara PLC Q04UDEH dengan kamera vision Keyence.
   - Mengatur trigger inspeksi, penerimaan hasil data inspeksi (OK/NG), transfer register data (DMOV/MOV), dan reset sinyal handshake.

3. **`MAIN.csv`**
   - Kumpulan program kontrol utama seluruh sekuens kerja mesin Camera Inspection 3K6Y.
   - Meliputi kontrol sekuens otomatis/manual, positioning control (QD75D2N), penghitungan counter part (OK/NG counter), kontrol motor/silinder, dan koordinasi antar modul.

4. **`IO Assignment Setting.csv`**
   - Parameter dan konfigurasi I/O modul pada rack base MELSEC-Q.

5. **`IP COM.txt`**
   - Catatan cepat alamat IP dan port komunikasi perangkat.
