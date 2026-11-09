# TTS-Subtitles — Core Package & Hướng Dẫn Cài Đặt Windows

Ứng dụng xử lý phụ đề/video, tạo TTS, chuẩn bị dữ liệu giọng nói, dịch phụ đề, OCR phụ đề cứng, tạo nhạc nền và Video Dubbing. Gói `TTS-Subtitles-Core.zip` chỉ chứa mã nguồn, giao diện, tài liệu và script; **không chứa model, whisper.cpp binary/source, thư viện cài sẵn, môi trường Python hay dữ liệu người dùng**. Sau khi giải nén trên PC khác, cài runtime và chỉ tải các model cho tính năng bạn muốn dùng.

Các model lớn không cần được tải cùng lúc. Whisper và OCR có thể cài/tải từ giao diện ứng dụng; phần lớn model TTS, dịch, nhạc và tách giọng được tải riêng theo hướng dẫn bên dưới. Chức năng TTS Piper chạy local sau khi có file model. Một số chức năng tùy chọn cần Internet trong bước cài/tải model hoặc cần API key.

## Gói Core gồm gì?

- Mã nguồn hiện tại, frontend assets, tests, scripts, `package.json`/lockfile và tài liệu.
- `Setup.bat`, `Start-App.bat`, `Stop-App.bat`, `.env.example`.
- Worker OCR `tools/subtitle-ocr/worker.py` (chỉ mã nguồn worker, không kèm runtime hay model).
- Không gồm `.git/`, `node_modules/`, `dist/`, `.venv*/`, `tools/whisper.cpp/`, `models/`, checkpoint/model weights, file media, cache, hoặc các thư mục dữ liệu như `datasets_storage/`, `jobs_storage/`, `video_dubbing_storage/`, `bgm_storage/`, `stories_storage/`, `join_audio_storage/` và `join_split_video_storage/`.

## Model và runtime theo từng tính năng

| Tính năng | Model/runtime cần thiết | Lựa chọn và vị trí |
|---|---|---|
| **TTS từ SRT/TXT, đọc văn bản, kể chuyện, TTS Master trong Video Dubbing** | Piper ONNX voice: mỗi giọng cần file `<voice>.onnx` cùng `<voice>.onnx.json`; eSpeak NG để đọc tiếng Việt có dấu. | Đặt file trong `models/`. Mặc định là `hoaimy-vietnamese-vi-medium-ljkjhi.onnx` và file JSON cùng tên. CSA Voice v3 dùng một model `vi_VN-csa-voice-piper-v3-medium.onnx` cho 5 speaker ID 0–4. Các model Piper khác đã khai báo trong `voice-catalog.ts` gồm Hoài My (các biến thể), Ban Mai, Thanh Niên Tự Tin, Việt Thảo, Huyền Ngọc, Duy Onyx, Doanh Doanh, Dung Dien, Yan 3D, Ngọc Ngạn, Ngọc Huyền, Ngô Không, USLT Ngô Không và các bản News Flash; model custom cũng được hỗ trợ. **Piper weights không tự tải trong app**: chép model và file JSON tương ứng từ PC cũ hoặc tải từ nguồn phát hành của từng giọng; có thể dùng trang nạp model để thêm model custom. |
| **TTS VieNeu** | VieNeu-TTS v3 Turbo; Python package `vieneu` trong môi trường riêng `.venv-vieneu`. | Chọn một file model trong `models/vieneu/`, khuyến nghị `vieneu-v3-turbo-q8_0.gguf` (~1.25 GB); bản BF16 lớn hơn là lựa chọn thay thế. `denoiser.onnx` là tùy chọn. Xem [HD-VIENEU-TTS.md](./HD-VIENEU-TTS.md). |
| **Nhận diện tiếng nói / chuẩn bị dataset Voice Clone** | Whisper.cpp binary và một Whisper GGML model. | Mô hình có thể chọn/tải trong tab quản lý Whisper: `ggml-base.bin` (~142 MB, nhẹ), `ggml-small.bin` (~466 MB, khuyên dùng tiếng Việt), `ggml-medium.bin` (~1.53 GB), hoặc `ggml-large-v3-turbo.bin` (~1.59 GB). Cần tối thiểu base hoặc small để phiên âm. Whisper.cpp được cài riêng bằng `npm run init:tools` hoặc từ phần quản lý công cụ trong ứng dụng. |
| **OCR phụ đề từ video** | PaddlePaddle CPU 3.3.1, PaddleOCR 3.7.0, OpenCC; hai model PP-OCRv5 mobile: `PP-OCRv5_mobile_det` (detection) và `PP-OCRv5_mobile_rec` (recognition). | Cài từ trang OCR trong ứng dụng; runtime và model được tải vào `%LOCALAPPDATA%/PiperTTSStudio/subtitle-ocr/`, không cần chép vào project. |
| **Dịch phụ đề local** | llama.cpp Vulkan server + một model Qwen3 GGUF quantized Q4_K_M. | Cài engine và tải model từ trang dịch. Mặc định/khuyên dùng `Qwen3-4B-Q4_K_M.gguf` (~2.5 GB); `Qwen3-8B-Q4_K_M.gguf` (~5 GB) và `Qwen3-14B-Q4_K_M.gguf` (~9 GB) cần nhiều RAM/VRAM hơn. Dữ liệu ở `%LOCALAPPDATA%/PiperTTSStudio/subtitle-translation/`. |
| **Dịch qua Gemini** | Không cần model local; cần `GEMINI_API_KEY`. | Cấu hình trong `.env` theo `.env.example` (nếu dùng ngoài môi trường tự cấp secret). Cần Internet và API key hợp lệ. |
| **Nhạc nền procedural** | Không cần AI model; cần FFmpeg cho các thao tác encode/ghép. | Có thể dùng ngay sau khi cài FFmpeg. |
| **Nhạc nền AI — MusicGen** | Python, PyTorch và `requirements-bgm.txt`; model `facebook/musicgen-small` (~2.2 GiB). | Tải theo yêu cầu trong giao diện; cache/project model ở `models/music/musicgen-small`. CPU chạy được nhưng chậm. |
| **Nhạc nền AI — AudioLDM Soundscape** | Python, PyTorch, Diffusers và `requirements-bgm.txt`; toàn bộ pipeline AudioLDM S-Full-v2 (~1.57 GiB). | Tải theo yêu cầu vào `models/music/audioldm-soundscape`. |
| **Tách giọng/nhạc trong Video Dubbing — Demucs** | Python, PyTorch, Demucs 4.1.0 và model `htdemucs` trong cache Hugging Face/Demucs. | Cài dependencies trong môi trường Python riêng; chạy lần đầu cần có model cache. Có thể chạy CPU hoặc CUDA. |
| **Tách giọng/nhạc — MDX DirectML (tùy chọn)** | `audio-separator==0.48.0`, `onnxruntime-directml==1.23.0`, Demucs 4.1.0 làm fallback; model `UVR-MDX-NET-Inst_HQ_3.onnx`. | Cài `requirements-video-dubbing-mdx.txt`, tải model riêng và cấu hình `VIDEO_DUBBING_MDX_MODEL_PATH`. Xem mục Video Dubbing bên dưới. |
| **Huấn luyện Piper Voice Clone** | Notebook Colab tải/cài training engine và base checkpoint riêng; cần dataset ZIP do ứng dụng tạo. | Không cần các training weights trong gói core. Đưa file `.onnx` và `.onnx.json` đã export về `models/` để dùng trong ứng dụng. |

**Model không được gói kèm.** Giấy phép và quyền sử dụng model/weights do nhà phát hành model quy định; hãy kiểm tra điều khoản trước khi sử dụng hoặc phân phối, nhất là cho mục đích thương mại.

## Cài đặt trên PC mới

1. Giải nén `TTS-Subtitles-Core.zip` vào một thư mục không bị hạn chế quyền ghi.
2. Cài Node.js LTS (20.19+ hoặc 22.12+), FFmpeg/FFprobe và eSpeak NG; sau đó chạy `Setup.bat`.
3. Chạy `Start-App.bat`. Mở các trang quản lý model để cài Whisper/OCR hoặc tải model theo nhu cầu.
4. Để dùng Piper TTS, chép file model `.onnx` **và** file `.onnx.json` tương ứng vào `models/`. Để dùng VieNeu, làm theo [HD-VIENEU-TTS.md](./HD-VIENEU-TTS.md).
5. Các chức năng AI Python là tùy chọn và nên dùng môi trường riêng; cài đúng file `requirements-*.txt` cho tính năng muốn kích hoạt.

Để chạy Whisper bằng tay sau khi giải nén: `npm run init:tools`. Trên Windows, ứng dụng cũng có thể tự tải Whisper binary; thao tác này không tải model Whisper nếu chưa chọn/tải model trong ứng dụng.

---

## 1. Yêu cầu hệ thống

- **Hệ điều hành**: Windows 10 hoặc Windows 11 (64-bit).
- **Node.js**: Phiên bản 20.19+ hoặc 22.12+ (khuyến nghị bản LTS hiện hành).
  - Tải tại: [https://nodejs.org/](https://nodejs.org/) (Chọn bản LTS và cài đặt mặc định).
- **eSpeak NG (BẮT BUỘC để phát âm tiếng Việt CÓ DẤU và thanh điệu chuẩn xác)**:
  - *Tại sao cần eSpeak NG?* PiperTTS sử dụng eSpeak NG để phân tích ngữ âm tiếng Việt (các nguyên âm có dấu `á, à, ả, ã, ạ, ă, â, đ, ê, ô, ơ, ư` và 6 thanh điệu). Nếu thiếu eSpeak NG, mô hình sẽ không đọc được dấu hoặc chỉ đọc được chữ không dấu.
  - **Cách cài đặt 1 (Khuyên dùng - 1 lệnh qua PowerShell/CMD)**:
    ```cmd
    winget install eSpeak-NG.eSpeak-NG
    ```
  - **Cách cài đặt 2 (Tải file MSI)**:
    - Vào link Releases chính thức: [https://github.com/espeak-ng/espeak-ng/releases](https://github.com/espeak-ng/espeak-ng/releases)
    - Tải file **`espeak-ng-X64.msi`** và cài đặt vào thư mục mặc định (`C:\Program Files\eSpeak NG`).
    - `Start-App.bat` và máy chủ sẽ tự động phát hiện đường dẫn này mà không cần bạn cấu hình thủ công.
- **FFmpeg/FFprobe (Bắt buộc cho Join Audio; khuyến nghị để nén MP3 và tăng tốc đọc `atempo`)**:
  - **Cách 1 (Tự động qua winget)**:
    ```cmd
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

### Video Dubbing (Giai đoạn 1–3B-1)

- Tab tải lịch sử từ ổ đĩa khi mở; có thể mở lại job sau refresh/khởi động lại, hoặc xóa riêng từng job sau xác nhận. Nút **Đóng job** chỉ bỏ job khỏi màn hình, không xóa dữ liệu.
- Metadata được lưu atomically trong `video_dubbing_storage/<jobId>/job.json`. Khi khởi động, máy chủ khôi phục metadata, FFprobe xác minh video/đầu ra trước khi báo khả dụng và đánh dấu tác vụ đang chạy dở là bị gián đoạn; không tự chạy lại tác vụ.
- API lịch sử: `GET /api/video-dubbing/jobs`. Mỗi mục trả trạng thái job, các file đầu ra đã được kiểm tra và cảnh báo nếu metadata/file bị thiếu hoặc không hợp lệ.
- Mở tab **Video Dubbing**, chọn video MP4, MKV, MOV, AVI hoặc WebM và chọn tệp SRT theo thứ tự bất kỳ.
- Video được gửi theo luồng tới máy chủ local để FFprobe đọc metadata. SRT được phân tích bằng parser hiện có; khi bấm **Tạo TTS Master**, các câu thoại và timestamp đã phân tích được gửi tới máy chủ local để dùng lại pipeline Đồng Bộ Phụ Đề.
- Chọn một giọng Piper có mô hình cục bộ và thiết lập tốc độ. Master được tạo thành WAV PCM mono 22,050 Hz trong thư mục job tương ứng; có thể theo dõi tiến trình và nghe thử ngay trong tab.
- Timeline giữ nguyên thứ tự và timestamp do parser Đồng Bộ Phụ Đề trả về. Các câu kéo dài quá cue vẫn dùng cơ chế giới hạn tốc độ hiện có; phần track vượt thời lượng video được trim ở cuối. Master ngắn hơn video không được kéo dài.
- Sau khi tạo Master, đặt riêng âm lượng TTS và audio gốc trong khoảng 0–200%, rồi tạo bản phối để nghe thử. Khi video không có audio, ứng dụng dùng một track im lặng. Bản phối được mã hóa AAC 192 kb/s, 48 kHz stereo; một limiter nhẹ được dùng để hạn chế clipping.
- Có thể xuất bản phối thành MP4 mới và tải xuống từ giao diện. Video được remux bằng stream copy, không mã hóa lại; nếu codec/container không tương thích, ứng dụng báo lỗi thay vì tự giảm chất lượng. MP4 và các file audio trung gian được giữ trong thư mục job cho đến khi chọn **Bỏ video**.
- Nếu tạo lại TTS Master, thay đổi mức âm lượng hoặc tạo lại bản phối, các MP4/bản phối cũ vẫn được giữ lại để tải/nghe nhưng được đánh dấu là bản cũ; cần tạo lại bản phối/xuất để có kết quả khớp thiết lập hiện tại.
- FFmpeg/FFprobe phải có trong `PATH` hoặc được cấu hình lần lượt qua `FFMPEG_PATH`/`FFPROBE_PATH`. Giới hạn upload mặc định là 4 GiB; có thể đặt `VIDEO_DUBBING_MAX_UPLOAD_BYTES` (đơn vị byte) trước khi chạy `Start-App.bat`.
- Video nguồn, WAV Master và dữ liệu tạm được lưu trong thư mục riêng của job dưới `video_dubbing_storage`; xóa job trong danh sách lịch sử để dọn dữ liệu tương ứng.
- `Start-App.bat` chỉ bind máy chủ vào `127.0.0.1`. Khi chạy trực tiếp ngoài launcher, có thể đặt biến `HOST` phù hợp với môi trường triển khai.

### Tách giọng và nhạc nền (Giai đoạn 3B-1)

- Video Dubbing có thể tách audio bằng MDX ONNX + DirectML (GPU DirectX 12) hoặc Demucs `htdemucs` (CUDA/CPU). `VIDEO_DUBBING_SEPARATION_BACKEND=auto` ưu tiên MDX DirectML khi MDX, DirectML và Demucs fallback đều sẵn sàng; nếu MDX inference lỗi, tác vụ tự chạy lại bằng Demucs. Đặt `demucs` để giữ backend cũ hoặc `mdx` để yêu cầu MDX và báo unavailable nếu cấu hình chưa đủ. Kết quả cuối vẫn là `vocals.wav` và `instrumental.wav`; hai file được FFprobe xác minh trước khi công bố.
- Tác vụ chuẩn hóa audio đầu vào thành WAV stereo 44.1 kHz để phù hợp với model. Khi inference, mạng bị vô hiệu hóa và model chỉ dùng từ cache; ứng dụng không tự cài package hay tải model. Nếu chưa sẵn sàng, API/UI báo unavailable.
- Mặc định dùng `python` trên PATH. Có thể trỏ riêng một Python environment bằng `VIDEO_DUBBING_SEPARATION_PYTHON` trước khi chạy ứng dụng; ứng dụng cũng nhận `BGM_PYTHON` hoặc `PYTHON` làm fallback. Để dùng MDX DirectML, tạo môi trường Python riêng và cài `requirements-video-dubbing-mdx.txt`; môi trường đó cũng cần Demucs 4.1.0 cùng cache model htdemucs để làm fallback. Không cần cài `torch-directml`: ứng dụng chỉ định `DmlExecutionProvider` trực tiếp cho inference ONNX.
- Tải trước model MDX `UVR-MDX-NET-Inst_HQ_3.onnx` bằng `audio-separator --download_model_only --model_filename UVR-MDX-NET-Inst_HQ_3.onnx --model_file_dir <model-folder>`, rồi đặt `VIDEO_DUBBING_MDX_MODEL_PATH` thành đường dẫn đầy đủ tới file model. Ứng dụng không tự tải/cài model. Trước khi khởi chạy server, đặt `VIDEO_DUBBING_SEPARATION_PYTHON` tới `python.exe` của môi trường riêng và `VIDEO_DUBBING_SEPARATION_BACKEND=auto`; restart server sau khi đổi biến.
- Preflight kiểm tra `DmlExecutionProvider`, file model local và Demucs fallback. Runtime DirectML hỏng sẽ được ghi log rồi chạy lại Demucs. MDX đang cho kết quả tốt hơn trong nghe thử hiện tại, nhưng kết quả có thể khác theo nguồn audio; kiểm tra track đầu ra trước khi dùng trong bản phối.
- Với Demucs 4.1.0, dùng `demucs.api.Separator` callback và đếm segment hoàn tất duy nhất theo model/shift/offset. Thanh tiến trình chỉ hiển thị phần trăm trong giai đoạn inference; kiểm tra, tải model, trích xuất và ghi/xác minh đầu ra hiển thị trạng thái không xác định. Chỉ báo 100% sau khi cả hai track đã được xác minh và công bố.
- Nếu máy chủ dừng trong khi tách, tác vụ được đánh dấu bị gián đoạn; không khôi phục tiến trình inference. Kết quả hoàn chỉnh trước đó vẫn được giữ. Nguồn tách không hoàn hảo: vocals có thể còn nhạc và instrumental có thể còn giọng. Kết quả không được tự động đưa vào bản phối hiện tại.
- Mã nguồn Demucs được phát hành theo MIT ([LICENSE upstream](https://github.com/facebookresearch/demucs/blob/main/LICENSE)). Repository model HTDemucs hiện không công bố trường license trong metadata/model card đã kiểm tra; cần tự xác minh điều kiện sử dụng weights, đặc biệt trước khi phân phối hoặc dùng thương mại.
- API: `GET /api/video-dubbing/separation/status`; `POST /api/video-dubbing/jobs/:jobId/separation`; `GET /api/video-dubbing/jobs/:jobId/separation`; `POST /api/video-dubbing/jobs/:jobId/separation/cancel`; nghe thử qua `GET /api/video-dubbing/jobs/:jobId/separation/vocals` và `/instrumental`.

---

## 3. Quy trình xử lý Audio & Dọn dẹp tệp tạm

Ứng dụng tuân thủ nghiêm ngặt quy trình xử lý tối ưu hóa tài nguyên đĩa cứng:

### Join Audio trong tab Clone Giọng

- Mở **Clone Giọng → Join Audio**, thêm một hoặc nhiều tệp `.mp3`/`.wav`; thứ tự thêm được giữ nguyên hoặc có thể sắp xếp theo tên A–Z.
- FFprobe kiểm tra đầu vào với tối đa 4 tiến trình đồng thời. FFmpeg ghép theo lô tối đa 32 tệp, chuẩn hóa trên toàn bộ audio và xuất WAV mono 16 kHz, PCM 16-bit, mặc định `-20 LUFS` / `-1 dBTP`. Có thể điều chỉnh target loudness và true peak trong giao diện.
- Giao diện chỉ giữ số lượng, dung lượng, thời lượng, tiến độ và lỗi cần xem; file được tải/ghi theo luồng thay vì nạp toàn bộ audio vào bộ nhớ. Có thể hủy tác vụ; dữ liệu nguồn không bị thay đổi và file tạm được dọn sau khi hoàn tất, hủy hoặc lỗi.
- Kết quả được FFprobe xác minh và lưu trong `join_audio_storage/results/`. Nút **Dùng cho Whisper** chuyển tham chiếu tệp kết quả trực tiếp vào quy trình Whisper.cpp hiện có trong **Chuẩn Bị Dữ Liệu Offline**, không tải WAV về trình duyệt.
- FFmpeg và FFprobe cần có trong `PATH` hoặc được cấu hình qua `FFMPEG_PATH` / `FFPROBE_PATH`.

1. **Đọc & Phân tích file phụ đề**:
   - Tải lên file `.srt` hoặc `.txt` có định dạng timestamp tiêu chuẩn.
   - Ứng dụng phân tích thành từng câu thoại với thời lượng mục tiêu `targetDuration = endTime - startTime`.
2. **Xử lý Batch Concurrency**:
   - Chọn **Batch Size** mong muốn (1, 2, **4 mặc định**, 8, 16 hoặc Custom).
   - Tối ưu tốc độ xử lý song song trên CPU đa nhân.
3. **TTS & Căn chỉnh Timestamp**:
   - Chọn giọng đọc trong danh sách (Hoài My, các giọng Việt khác hoặc 5 giọng CSA Voice v3) để tổng hợp bằng PiperTTS.
   - Với CSA Voice v3, lựa chọn tương ứng speaker ID `0–4` được dùng cho từng câu.
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
| `server.ts`                    | Máy chủ Express tích hợp PiperNativeTTS, FFmpeg spawning, timeline assembly |
| `joinAudioManager.ts`          | Quản lý upload theo luồng, ghép theo lô, chuẩn hóa và xác minh WAV          |
| `joinAudioRoutes.ts`           | API tiến độ, hủy tác vụ và phân phối kết quả Join Audio                     |
| `src/components/JoinAudioTab.tsx` | Giao diện thêm tệp, cấu hình chuẩn hóa và nghe thử Join Audio            |
| `join_audio_storage/`    | Kết quả WAV đã xác minh và dữ liệu tạm của Join Audio                       |
| `videoDubbingManager.ts`        | Quản lý upload, metadata bền vững, khôi phục và lịch sử job                  |
| `videoDubbingRoutes.ts`         | API job, history, task và đầu ra Video Dubbing                               |
| `videoDubbingMaster.ts`         | Điều phối pipeline Đồng Bộ Phụ Đề hiện có cho TTS Master Video Dubbing       |
| `videoDubbingMedia.ts`           | Điều phối trích audio, trộn, xác minh và xuất MP4 bằng FFmpeg/FFprobe        |
| `videoDubbingSeparation.ts`      | Kiểm tra Demucs/model cục bộ, tách và xác minh hai track                       |
| `src/components/VideoDubbingTab.tsx` | Giao diện lịch sử job, chọn video/SRT, tạo Master, tách, trộn và xuất MP4 |
| `models/`                       | Thư mục chứa các mô hình giọng đọc Piper ONNX và file cấu hình              |
| `jobs_storage/`                 | Thư mục tạm dùng trong lúc ghép nối timeline (tự xóa sau khi xong)          |
| `video_dubbing_storage/`        | Thư mục job gồm metadata và các đầu ra Video Dubbing                        |
| `dist/`                         | Bản build sản phẩm của frontend React + Vite                                |
| `package.json`                  | Cấu hình phụ thuộc và lệnh chạy                                             |

---

## 5. Khắc phục sự cố thường gặp

### Tạo nhạc nền bằng model AI (tùy chọn)

Chế độ **Mô Hình Deep Learning AI** cho phép chọn Meta MusicGen Small để tạo nhạc hoặc AudioLDM S-Full-v2 để tạo soundscape/âm thanh môi trường. Chế độ **Procedural DSP** vẫn dùng FFmpeg như trước.

1. Cài Python 3.10 trở lên và PyTorch phù hợp với máy.
2. Chạy `python -m pip install -r requirements-bgm.txt`.
3. Trong tab **Tạo Nhạc Nền**, tải model muốn dùng ở phần **Quản lý Model**, chọn chế độ AI, sau đó chọn **Meta MusicGen Small** hoặc **AudioLDM Soundscape** trong danh sách mô hình.

Lần chạy đầu của MusicGen cần kết nối mạng để tải metadata/tokenizer từ Hugging Face. Weights được nạp từ thư mục `models/music/musicgen-small`; MusicGen chạy trên CPU có thể mất vài phút, tùy độ dài audio và cấu hình máy. AudioLDM tải toàn bộ pipeline (~1.57 GiB) vào `models/music/audioldm-soundscape` để chạy offline; các đoạn tối đa 10 giây được nối thành audio dài, nên tạo lâu hơn khi chọn thời lượng dài. AudioLDM S-Full-v2 được cấp phép CC-BY-NC-SA 4.0; cần tuân thủ điều khoản giấy phép, bao gồm giới hạn sử dụng thương mại. Cài `diffusers` và `scipy` cùng các thư viện còn lại bằng requirements-bgm.txt. Đặt biến môi trường `BGM_PYTHON` nếu muốn máy chủ dùng một Python interpreter cụ thể.

Nếu Python báo thiếu module hoặc không tải được metadata, lỗi sẽ hiển thị trong giao diện; ứng dụng không tự chuyển sang DSP.


1. **Giọng đọc bị mất dấu hoặc chỉ đọc được tiếng Việt không dấu:**
   - Nguyên nhân: Hệ thống chưa cài đặt hoặc chưa nhận diện được `eSpeak NG`.
   - Khắc phục: Mở Command Prompt hoặc PowerShell, chạy lệnh:
     ```cmd
     winget install eSpeak-NG.eSpeak-NG
     ```
     Hoặc tải file `espeak-ng-X64.msi` từ GitHub eSpeak-NG và cài đặt. Sau đó chạy lại `Start-App.bat`.

2. **Trình duyệt báo không thể kết nối tới `http://localhost:3000`:**
   - Hãy chắc chắn rằng cửa sổ `Start-App.bat` vẫn đang mở và báo `HOÀI MY PIPER TTS - MÁY CHỦ SẴN SÀNG`.

3. **Cổng 3000 bị báo đang bận:**
   - Nhấp đúp vào `Stop-App.bat` để quét và giải phóng cổng 3000, sau đó chạy lại `Start-App.bat`.

4. **Cảnh báo chưa tìm thấy FFmpeg:**
   - Ứng dụng vẫn có thể đọc và đo thời lượng file WAV. Tuy nhiên để nén sang MP3 và tăng tốc câu dài qua bộ lọc `atempo`, hãy chạy `winget install Gyan.FFmpeg` hoặc chép `ffmpeg.exe` vào thư mục dự án.
