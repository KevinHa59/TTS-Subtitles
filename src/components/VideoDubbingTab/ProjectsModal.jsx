import { Clock, Film, Folder, Pencil, Plus, Star, Trash2, X } from "lucide-react";

export default function ProjectsModal({
  activeProject,
  createProject,
  defaultProjectId,
  deleteProject,
  openProject,
  projectBusy,
  projectError,
  projectSaveState,
  projects = [],
  renameProject,
  setDefaultProject,
  setProjectsExpanded,
}) {
  const commonStoragePath =
    projects.find((p) => p.storagePath)?.storagePath?.replace(/[/\\][^/\\]+$/, "") ||
    projects.find((p) => p.jobsDirectory)?.jobsDirectory?.replace(/[/\\][^/\\]+$/, "") ||
    "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setProjectsExpanded(false);
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="video-dubbing-projects-title"
        className="max-h-[90vh] w-full max-w-4xl space-y-4 overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-2xl sm:p-6"
      >
        {/* Trên cùng panel: Tiêu đề của panel */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
          <div>
            <h3
              id="video-dubbing-projects-title"
              className="text-base font-semibold text-white"
            >
              Project Video Dubbing
            </h3>
            <p className="mt-0.5 text-xs text-slate-400">
              Mặc định ứng dụng mở workspace trống. Chỉ project được đặt mặc
              định mới tự mở khi khởi động.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={projectBusy}
              onClick={() => void createProject()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sky-400 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-sky-300 disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              Tạo project từ phiên hiện tại
            </button>
            <button
              type="button"
              onClick={() => setProjectsExpanded(false)}
              className="rounded-lg border border-slate-700 p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
              aria-label="Đóng"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Thông báo lỗi nếu có */}
        {projectError && (
          <p className="rounded-lg border border-rose-500/30 bg-rose-950/30 p-2.5 text-xs text-rose-200">
            {projectError}
          </p>
        )}

        {/* Trạng thái project đang mở */}
        <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
          <span>
            {activeProject
              ? `Đang mở: ${activeProject.name} · ${
                  projectSaveState === "saved"
                    ? "Đã lưu"
                    : projectSaveState === "saving"
                      ? "Đang lưu…"
                      : "Lỗi lưu"
                }`
              : "Chưa mở project"}
          </span>
          <span className="text-[11px] text-slate-500">
            Tổng cộng: {projects.length} project
          </span>
        </div>

        {/* Phía dưới: 1 path chung cho tất cả project */}
        {commonStoragePath && (
          <div className="flex items-center gap-2.5 rounded-xl border border-slate-800 bg-slate-950/70 px-3.5 py-2.5 text-xs text-slate-300">
            <Folder className="h-4 w-4 shrink-0 text-cyan-400" />
            <span className="shrink-0 font-medium text-slate-400">
              Đường dẫn chung:
            </span>
            <code
              className="min-w-0 flex-1 truncate font-mono text-[11px] text-cyan-200 select-all"
              title={commonStoragePath}
            >
              {commonStoragePath}
            </code>
          </div>
        )}

        {/* Cuối cùng: Danh sách project theo dạng card grid */}
        {projects.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-8 text-center text-sm text-slate-500">
            Chưa có project nào được lưu.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => {
              const isActive = activeProject?.id === project.id;
              const isDefault = defaultProjectId === project.id;
              return (
                <div
                  key={project.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => !projectBusy && void openProject(project)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      if (!projectBusy) void openProject(project);
                    }
                  }}
                  className={`group relative flex flex-col justify-between rounded-xl border p-3.5 text-left transition-all cursor-pointer ${
                    isActive
                      ? "border-cyan-400/60 bg-cyan-950/20 shadow-lg shadow-cyan-950/30"
                      : "border-slate-800 bg-slate-950/50 hover:border-slate-700 hover:bg-slate-900/60 hover:shadow-md"
                  }`}
                  title="Nhấn vào card để mở project"
                >
                  <div>
                    {/* Header card: Tên project & các huy hiệu */}
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-semibold text-sm text-white group-hover:text-cyan-200 transition-colors line-clamp-2">
                        {project.name}
                      </h4>
                      <div className="flex shrink-0 items-center gap-1">
                        {isDefault && (
                          <span className="rounded-full border border-emerald-500/30 bg-emerald-950/50 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                            Mặc định
                          </span>
                        )}
                        {isActive && (
                          <span className="rounded-full border border-cyan-500/30 bg-cyan-950/50 px-2 py-0.5 text-[10px] font-semibold text-cyan-300">
                            Đang mở
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Nội dung card: video/job và thời gian cập nhật */}
                    <div className="mt-3 space-y-1.5 text-xs text-slate-400">
                      <div className="flex items-center gap-1.5">
                        <Film className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                        <span>{project.jobIds?.length ?? 0} video/job</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                        <Clock className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                        <span>
                          {new Date(project.updatedAt).toLocaleString("vi-VN")}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Thanh nút tác vụ: stopPropagation để không kích hoạt openProject */}
                  <div className="mt-4 flex flex-wrap items-center justify-end gap-1.5 border-t border-slate-800/80 pt-2.5">
                    <button
                      type="button"
                      disabled={projectBusy}
                      onClick={(event) => {
                        event.stopPropagation();
                        void renameProject(project);
                      }}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900/80 px-2 py-1 text-[11px] font-medium text-slate-300 hover:border-slate-600 hover:text-white disabled:opacity-50 transition-colors"
                      title="Đổi tên project"
                    >
                      <Pencil className="h-3 w-3" />
                      Đổi tên
                    </button>
                    <button
                      type="button"
                      disabled={projectBusy}
                      onClick={(event) => {
                        event.stopPropagation();
                        setDefaultProject(isDefault ? null : project);
                      }}
                      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 ${
                        isDefault
                          ? "border-emerald-500/40 bg-emerald-950/30 text-emerald-300 hover:bg-emerald-900/40"
                          : "border-slate-700 bg-slate-900/80 text-slate-300 hover:border-slate-600 hover:text-white"
                      }`}
                      title={
                        isDefault
                          ? "Bỏ đặt mặc định"
                          : "Đặt làm project mặc định"
                      }
                    >
                      <Star className="h-3 w-3" />
                      {isDefault ? "Bỏ mặc định" : "Mặc định"}
                    </button>
                    <button
                      type="button"
                      disabled={projectBusy}
                      onClick={(event) => {
                        event.stopPropagation();
                        void deleteProject(project);
                      }}
                      className="inline-flex items-center gap-1 rounded-md border border-rose-500/30 bg-rose-950/20 px-2 py-1 text-[11px] font-medium text-rose-300 hover:bg-rose-900/30 disabled:opacity-50 transition-colors"
                      title="Xóa project"
                    >
                      <Trash2 className="h-3 w-3" />
                      Xóa
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
