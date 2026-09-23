# Ladder Diagram PLC - Camera Inspection 3K6Y

Repository ini berisi program PLC Ladder Diagram yang diekspor dari **Mitsubishi GX Works 2** untuk mesin **Camera Inspection 3K6Y (v1.9)**.

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
