# 🎙️ HƯỚNG DẪN CÀI ĐẶT & SỬ DỤNG MÔ HÌNH VIENEU-TTS v3 TURBO (48 kHz)

Tài liệu này hướng dẫn chi tiết cách tải các tệp mô hình nặng của **VieNeu-TTS v3 Turbo** và đặt vào đúng vị trí trong dự án để hệ thống tự động nhận diện và sử dụng toàn bộ **25 giọng đọc** tiếng Việt chất lượng cao.

---

## 1. Vị trí đặt file trong Project

Bạn hãy đặt các tệp mô hình đã tải về vào đúng thư mục sau:

```text
📁 pipertts/ (hoặc thư mục gốc của project)
└── 📁 models/
    └── 📁 vieneu/            <--- ĐẶT CÁC FILE VÀO THƯ MỤC NÀY
        ├── vieneu-v3-turbo-q8_0.gguf   (File mô hình chính)
        ├── denoiser.onnx               (File lọc ồn - tùy chọn)
        └── README.txt
```

> 💡 **Ghi chú**: Thư mục `models/vieneu/` đã được tạo sẵn trong project. Bạn chỉ cần tải file về và sao chép thẳng vào đây.

---

## 2. Link tải các file từ Hugging Face

Truy cập kho mô hình chính thức: [pnnbao-ump/VieNeu-TTS-v3-Turbo trên Hugging Face](https://huggingface.co/pnnbao-ump/VieNeu-TTS-v3-Turbo)

### 🔹 File 1: File Trọng Số Mô Hình Chính (Bắt buộc - Chọn 1 trong 2 bản)

* **Bản Q8 Quantized (Khuyên dùng - Nhanh, nhẹ, chuẩn 48 kHz cho CPU):**
  * Tên file: `vieneu-v3-turbo-q8_0.gguf`
  * Dung lượng: ~1.25 GB
  * 👉 **[Link tải trực tiếp vieneu-v3-turbo-q8_0.gguf](https://huggingface.co/pnnbao-ump/VieNeu-TTS-v3-Turbo/resolve/main/gguf/vieneu-v3-turbo-q8_0.gguf)**

* **Bản BF16 Đầy Đủ (Độ chính xác nguyên bản, dành cho máy có card đồ họa GPU hoặc RAM dồi dào):**
  * Tên file: `vieneu-v3-turbo-bf16.gguf`
  * Dung lượng: ~2.4 GB
  * 👉 **[Link tải trực tiếp vieneu-v3-turbo-bf16.gguf](https://huggingface.co/pnnbao-ump/VieNeu-TTS-v3-Turbo/resolve/main/gguf/vieneu-v3-turbo-bf16.gguf)**

### 🔹 File 2: File Lọc Nhiễu Âm Thanh (Tùy chọn)

* **Tên file:** `denoiser.onnx`
* **Dung lượng:** ~15 MB
* 👉 **[Link tải trực tiếp denoiser.onnx](https://huggingface.co/pnnbao-ump/VieNeu-TTS-v3-Turbo/resolve/main/denoiser.onnx)**

---

## 3. Cài đặt thư viện Python `vieneu`

Mô hình VieNeu-TTS chạy trên nền tảng Python SDK `vieneu` (tối ưu hóa torch-free qua ONNX Runtime trên CPU, không cần cài đặt nặng nề). Bạn chỉ cần mở cửa sổ Terminal/Command Prompt trong thư mục project và chạy lệnh:

```bash
pip install vieneu
```

*(Nếu máy bạn có GPU NVIDIA CUDA và muốn tăng tốc batching thì có thể cài đặt thêm `torch` và `torchaudio` theo hướng dẫn của thư viện).*

---

## 4. Danh sách 25 giọng đọc VieNeu-TTS v3 Turbo tích hợp trong hệ thống

Tất cả 25 giọng đọc dưới đây đã được cập nhật sẵn vào hệ thống và có thể chọn ở cả 3 mục: **Đồng bộ Phụ Đề SRT**, **Đọc Văn Bản Đơn**, và **Kể Chuyện Đa Nhân Vật**.

| STT | Mã Giọng (ID) | Tên Giọng Đọc | Giới Tính | Vùng Miền | Phong Cách Đọc | Điểm Nổi Bật |
|:---:|:---|:---|:---:|:---:|:---|:---|
| 1 | `vieneu:minh_quan_pro` | **Minh Quân Pro** | Nam | Miền Bắc | Tự nhiên (Default) | Giọng mặc định chuẩn 48 kHz, ấm áp, truyền cảm |
| 2 | `vieneu:adam_bua` | **Adam bựa** | Nam | Miền Bắc | Tự nhiên / Hài hước | Phong cách trẻ trung, dí dỏm, độc đáo |
| 3 | `vieneu:truc_ly` | **Trúc Ly** | Nữ | Miền Bắc | Tự nhiên | Dịu dàng, thanh thoát, tròn vành rõ chữ |
| 4 | `vieneu:anh_khoi` | **Anh Khôi** | Nam | Miền Bắc | Kể chuyện | Phong cách dẫn dắt, kịch tính, lôi cuốn |
| 5 | `vieneu:mai_anh` | **Mai Anh** | Nữ | Miền Bắc | Tin tức | Chuyên nghiệp, rành mạch, chuẩn phát thanh viên |
| 6 | `vieneu:thuy_dung` | **Thùy Dung** | Nữ | Miền Nam | Tin tức | Âm sắc miền Nam chuẩn, tự nhiên, nhã nhặn |
| 7 | `vieneu:thien_tam_duc` | **Thiền Tâm Đức** | Nam | Miền Bắc | Kể chuyện / Tâm sự | Tông trầm sâu, an tĩnh, thích hợp triết lý / thiền định |
| 8 | `vieneu:ngoc_huyen` | **Ngọc Huyền** | Nữ | Miền Bắc | Tự nhiên | Ngọt ngào, trong sáng, thân thiện |
| 9 | `vieneu:quang_son` | **Quang Sơn** | Nam | Miền Trung | Tự nhiên | Âm sắc miền Trung mộc mạc, phóng khoáng, chân thật |
| 10 | `vieneu:ngoc_tran` | **Ngọc Trân** | Nữ | Miền Trung | Tự nhiên | Dịu dàng, mang nét duyên dáng xứ Huế / miền Trung |
| 11 | `vieneu:minh_duc` | **Minh Đức** | Nam | Miền Bắc | Tin tức | Dõng dạc, nghiêm túc, phong thái đài truyền hình |
| 12 | `vieneu:pham_tuyen` | **Phạm Tuyên** | Nam | Miền Bắc | Tự nhiên | Tự nhiên, gần gũi, đời thường |
| 13 | `vieneu:thai_son` | **Thái Sơn** | Nam | Miền Nam | Kể chuyện | Trầm ấm, hào sảng Nam Bộ, thích hợp đọc truyện |
| 14 | `vieneu:xuan_vinh` | **Xuân Vĩnh** | Nam | Miền Bắc | Tự nhiên | Nhanh nhẹn, biểu cảm linh hoạt |
| 15 | `vieneu:thanh_binh` | **Thanh Bình** | Nam | Miền Bắc | Kể chuyện | Sâu lắng, nhịp điệu thong thả |
| 16 | `vieneu:ngoc_linh` | **Ngọc Linh** | Nữ | Miền Bắc | Kể chuyện | Hút hồn, diễn cảm tốt theo từng tình huống |
| 17 | `vieneu:doan_trang` | **Đoan Trang** | Nữ | Miền Bắc | Tự nhiên | Tươi tắn, tự nhiên, gần gũi |
| 18 | `vieneu:thuc_doan` | **Thục Đoan** | Nữ | Miền Nam | Kể chuyện | Ngọt ngào miền Nam, truyền tải cảm xúc trọn vẹn |
| 19 | `vieneu:minh_triet` | **Minh Triết** | Nam | Miền Nam | Tin tức | Chững chạc, thông tin rõ ràng |
| 20 | `vieneu:my_duyen` | **Mỹ Duyên** | Nữ | Miền Nam | Đọc truyện | Êm đềm, thích hợp truyện ngôn tình / tâm sự |
| 21 | `vieneu:quynh_anh` | **Quỳnh Anh** | Nữ | Miền Bắc | Đọc truyện | Sâu sắc, ấm áp, ngắt nghỉ điêu luyện |
| 22 | `vieneu:duc_tri` | **Đức Trí** | Nam | Miền Nam | Đọc truyện | Giọng nam miền Nam lôi cuốn, có chiều sâu |
| 23 | `vieneu:kim_thanh` | **Kim Thanh** | Nữ | Miền Nam | Đọc truyện | Trong trẻo, thanh tú, rất dễ nghe |
| 24 | `vieneu:adam` | **Adam** | Nam | Miền Nam | Tự nhiên | Hiện đại, tự nhiên, sinh động |
| 25 | `vieneu:manh_dung` | **Mạnh Dũng** | Nam | Miền Bắc | Tự nhiên | Vững chãi, chân phương, mộc mạc |

---

## 5. Sử dụng trong ứng dụng

1. **Chọn giọng trong bảng Đổi Giọng Đọc:**
   * Mở bảng giọng đọc -> Sử dụng bộ lọc **VieNeu-TTS (25)** để xem riêng các giọng VieNeu.
   * Có thể lọc theo Giới tính (**Nam / Nữ**) hoặc Vùng miền (**Bắc / Trung / Nam**).
2. **Kể Chuyện Đa Nhân Vật:**
   * Bạn có thể kết hợp cả giọng **Piper TTS** (Hoài My, Việt Thảo...) và **VieNeu-TTS** (Minh Quân Pro, Trúc Ly...) cho các nhân vật khác nhau trong cùng một câu chuyện.
   * Hệ thống sẽ tự động ghép nối PCM các giọng này lại thành một bản Master hoàn chỉnh và xuất ra phụ đề SRT chính xác theo thời lượng từng câu!
