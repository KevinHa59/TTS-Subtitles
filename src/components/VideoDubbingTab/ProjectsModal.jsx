export default function ProjectsModal({
  activeProject,
  createProject,
  defaultProjectId,
  deleteProject,
  openProject,
  projectBusy,
  projectError,
  projectSaveState,
  projects,
  renameProject,
  setDefaultProject,
  setProjectsExpanded,
}) {
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
        className="max-h-[88vh] w-full max-w-3xl space-y-4 overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-2xl sm:p-5"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3
              id="video-dubbing-projects-title"
              className="font-semibold text-white"
            >
              Project Video Dubbing
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              Mặc định ứng dụng mở workspace trống. Chỉ project được đặt mặc
              định mới tự mở khi khởi động.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setProjectsExpanded(false)}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:text-white"
          >
            Đóng
          </button>
        </div>
        {projectError && (
          <p className="rounded-lg border border-rose-500/30 bg-rose-950/30 p-2.5 text-xs text-rose-200">
            {projectError}
          </p>
        )}
        <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/50 p-3">
          <span className="text-xs text-slate-400">
            {activeProject
              ? `Đang mở: ${activeProject.name} · ${projectSaveState === "saved" ? "Đã lưu" : projectSaveState === "saving" ? "Đang lưu…" : "Lỗi lưu"}`
              : "Chưa mở project"}
          </span>
          <button
            type="button"
            disabled={projectBusy}
            onClick={() => void createProject()}
            className="rounded-lg bg-sky-400 px-3 py-2 text-xs font-bold text-slate-950 disabled:opacity-50"
          >
            Tạo project từ phiên hiện tại
          </button>
        </div>
        {projects.length === 0 ? (
          <p className="rounded-xl border border-slate-800 p-4 text-sm text-slate-500">
            Chưa có project được lưu.
          </p>
        ) : (
          <ul className="space-y-2">
            {projects.map((project) => (
              <li
                key={project.id}
                className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 ${activeProject?.id === project.id ? "border-sky-500/40 bg-sky-950/15" : "border-slate-800 bg-slate-950/40"}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">
                    {project.name}
                    {defaultProjectId === project.id && (
                      <span className="ml-2 rounded-full border border-emerald-500/30 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                        Mặc định
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {project.jobIds.length} video/job · cập nhật{" "}
                    {new Date(project.updatedAt).toLocaleString()}
                  </p>
                  {project.storagePath && (
                    <p
                      className="mt-1 break-all font-mono text-[10px] leading-relaxed text-slate-400"
                      title={project.storagePath}
                    >
                      Thư mục project: {project.storagePath}
                    </p>
                  )}
                  {project.jobsDirectory && (
                    <p
                      className="break-all font-mono text-[10px] leading-relaxed text-sky-300/80"
                      title={project.jobsDirectory}
                    >
                      Video được lưu trong: {project.jobsDirectory}
                      {"\\<ID video>\\source.video"}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={projectBusy}
                    onClick={() => void openProject(project)}
                    className="rounded-lg border border-sky-500/30 px-3 py-1.5 text-xs text-sky-200 disabled:opacity-50"
                  >
                    Mở
                  </button>
                  <button
                    type="button"
                    disabled={projectBusy}
                    onClick={() => void renameProject(project)}
                    className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 disabled:opacity-50"
                  >
                    Đổi tên
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setDefaultProject(
                        defaultProjectId === project.id ? null : project,
                      )
                    }
                    className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300"
                  >
                    {defaultProjectId === project.id
                      ? "Bỏ mặc định"
                      : "Đặt mặc định"}
                  </button>
                  <button
                    type="button"
                    disabled={projectBusy}
                    onClick={() => void deleteProject(project)}
                    className="rounded-lg border border-rose-500/30 px-3 py-1.5 text-xs text-rose-200 disabled:opacity-50"
                  >
                    Xóa
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
