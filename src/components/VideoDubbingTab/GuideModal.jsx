export default function GuideModal({ setGuideOpen }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setGuideOpen(false);
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="video-dubbing-guide-title"
        className="w-full max-w-xl space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl"
      >
        <div className="flex items-center justify-between gap-3">
          <h3
            id="video-dubbing-guide-title"
            className="font-semibold text-white"
          >
            Hướng Dẫn
          </h3>
          <button
            type="button"
            onClick={() => setGuideOpen(false)}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:text-white"
          >
            Đóng
          </button>
        </div>
        <ul className="space-y-3 text-sm text-slate-300">
          <li>
            <b className="text-white">Bắt đầu hàng đợi:</b> xử lý tuần tự các
            video và SRT trong danh sách nguồn.
          </li>
          <li>
            <b className="text-white">TTS:</b> tạo TTS Master và tách
            vocal/instrumental nếu được bật; không tự chạy Mix Audio hay Render.
          </li>
          <li>
            <b className="text-white">Mix Audio:</b> tạo file âm thanh cuối từ
            các track và mixer của video đang chọn.
          </li>
          <li>
            <b className="text-white">Render:</b> ghép final mix, phụ đề và logo
            vào video đang chọn.
          </li>
          <li>
            <b className="text-white">Mở Project Folder:</b> mở thư mục chứa dữ
            liệu của project đang mở.
          </li>
          <li>
            <b className="text-white">Lịch sử job:</b> xem lại và mở các job đã
            lưu.
          </li>
        </ul>
      </section>
    </div>
  );
}
