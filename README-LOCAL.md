# Hướng Dẫn Cài Đặt & Sử Dụng Hoài My Piper TTS Trên Windows

Ứng dụng chuyển đổi phụ đề SRT/TXT thành Audio TTS tiếng Việt chất lượng cao với giọng đọc **Hoài My** (`hub:hoaimy-vietnamese-vi-medium-ljkjhi`), tự động điều chỉnh tốc độ đọc theo timestamp, ghép nối timeline âm thanh, giữ lại audio từng câu và dọn dữ liệu khi người dùng yêu cầu.

---

## 1. Yêu cầu hệ thống

- **Hệ điều hành**: Windows 10 hoặc Windows 11 (64-bit).
- **espeak-ng**: Tải và cài đặt espeak-ng.
- **Node.js**: Phiên bản LTS 18.x, 20.x hoặc mới hơn.
  - Tải tại: [https://nodejs.org/](https://nodejs.org/) (Chọn bản LTS và cài đặt mặc định).
- **FFmpeg** (Khuyến nghị để nén MP3 và tăng tốc đọc `atempo`):
  - **Cách 1 (Khuyên dùng - tự động)**: Mở PowerShell và chạy lệnh:
    ```powershell
    winget install Gyan.FFmpeg
    ```
  - **Cách 2**: Tải bản giải nén từ [gyan.dev/ffmpeg/builds](https://www.gyan.dev/ffmpeg/builds/) rồi chép trực tiếp file `ffmpeg.exe` (và `ffprobe.exe`) vào cùng thư mục với dự án này.

---

## 2. Khởi chạy 1 chạm bằng File .bat

Bạn **không cần** mở VS Code, không cần gõ lệnh dòng lệnh phức tạp. Mọi thao tác đều được tự động hóa qua 3 file script:

### Bước 1: Thiết lập lần đầu (Chỉ chạy 1 lần duy nhất)

- Nhấp đúp vào file **`Setup.bat`**.
- File sẽ tự động:
  1. Kiểm tra môi trường Node.js & FFmpeg.
  2. Cài đặt các gói thư viện (`npm install`).
  3. Biên dịch giao diện frontend sang thư mục `dist` (`npm run build`).
- Khi màn hình hiện **"THIẾT LẬP THÀNH CÔNG!"**, bạn có thể bấm phím bất kỳ để đóng cửa sổ.

### Bước 2: Khởi động hằng ngày

- Nhấp đúp vào file **`Start-App.bat`**.
- Ứng dụng sẽ:
  1. Khởi chạy máy chủ local production.
  2. Tự động mở trình duyệt web tại địa chỉ: **`http://localhost:3000`**.
  3. Tự động nạp sẵn mô hình PiperTTS Hoài My vào bộ nhớ để tổng hợp giọng đọc tức thì.

### Bước 3: Dừng ứng dụng khi dùng xong

- Nhấp đúp vào file **`Stop-App.bat`** (hoặc chỉ cần đóng cửa sổ máy chủ `Start-App.bat`).
- Ứng dụng sẽ dừng đúng tiến trình và giải phóng cổng 3000 hoàn toàn.

---

## 3. Quy trình xử lý Audio & Dọn dẹp tệp tạm

Ứng dụng tuân thủ nghiêm ngặt quy trình xử lý tối ưu hóa tài nguyên đĩa cứng:

1. **Đọc & Phân tích file phụ đề**:
   - Tải lên file `.srt` hoặc `.txt` có định dạng timestamp tiêu chuẩn.
   - Ứng dụng phân tích thành từng câu thoại với thời lượng mục tiêu `targetDuration = endTime - startTime`.
2. **Xử lý Batch Concurrency**:
   - Chọn **Batch Size** mong muốn (1, 2, **4 mặc định**, 8, 16 hoặc Custom).
   - Tối ưu tốc độ xử lý song song trên CPU đa nhân.
3. **TTS Hoài My & Căn chỉnh Timestamp**:
   - Sinh giọng đọc tự nhiên bằng PiperTTS với model `hub:hoaimy-vietnamese-vi-medium-ljkjhi`.
   - Đo thời lượng audio thực tế của từng câu.
   - Tự động điều chỉnh tốc độ đọc (`atempo`) để khớp chính xác timeline phụ đề mà vẫn giữ chất giọng tự nhiên, không méo tiếng.
4. **Ghép Timeline (Master Assembly)**:
   - Ghép nối tất cả câu thoại vào đúng mốc thời gian (sample-accurate PCM assembly) kèm khoảng lặng giữa các câu.
   - Xuất file hoàn chỉnh định dạng MP3 (hoặc WAV).
5. **Phát lại audio từng câu và dọn dẹp dữ liệu**:
   - File WAV từng câu (`item_*_orig.wav`, `item_*_adjusted.wav`) và WAV master được giữ lại sau khi hoàn tất để có thể phát lại hoặc kiểm tra từng bước.
   - Nút **"Dọn Dẹp & Làm Mới"** xóa các file của dự án hiện tại và đặt lại trạng thái để bắt đầu một file mới.

---

## 4. Các file chính trong dự án

| Tên file / Thư mục | Mục đích                                                                    |
| ------------------ | --------------------------------------------------------------------------- |
| `Setup.bat`        | Script cài đặt thư viện và build frontend lần đầu trên Windows              |
| `Start-App.bat`    | Script khởi chạy máy chủ production local và tự mở trình duyệt              |
| `Stop-App.bat`     | Script dừng an toàn tiến trình ứng dụng trên cổng 3000                      |
| `server.ts`        | Máy chủ Express tích hợp PiperNativeTTS, FFmpeg spawning, timeline assembly |
| `models/`          | Thư mục chứa mô hình giọng đọc Hoài My ONNX được tải tự động                |
| `jobs_storage/`    | Thư mục tạm dùng trong lúc ghép nối timeline (tự xóa sau khi xong)          |
| `dist/`            | Bản build sản phẩm của frontend React + Vite                                |
| `package.json`     | Cấu hình phụ thuộc và lệnh chạy                                             |

---

## 5. Khắc phục sự cố thường gặp

1. **Trình duyệt báo không thể kết nối tới `http://localhost:3000`:**
   - Hãy chắc chắn rằng cửa sổ `Start-App.bat` vẫn đang mở và báo `HOÀI MY PIPER TTS - MÁY CHỦ SẴN SÀNG`.
2. **Cổng 3000 bị báo đang bận:**
   - Nhấp đúp vào `Stop-App.bat` để quét và giải phóng cổng 3000, sau đó chạy lại `Start-App.bat`.
3. **Cảnh báo chưa tìm thấy FFmpeg:**
   - Ứng dụng vẫn có thể đọc và đo thời lượng file WAV. Tuy nhiên để nén sang MP3 và tăng tốc câu dài qua bộ lọc `atempo`, hãy chạy `winget install Gyan.FFmpeg` hoặc chép `ffmpeg.exe` vào thư mục dự án.
