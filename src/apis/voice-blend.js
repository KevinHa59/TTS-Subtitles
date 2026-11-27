// voiceClient.js – gọi API giọng nói từ webapp Vite.
// Đặt vào src/ (ví dụ src/lib/voiceClient.js).
// Luồng: trình duyệt -> Express (voice.js, gắn tại /api/voice) -> OpenVoice FastAPI (run_api.bat).
// Có thể đổi địa chỉ bằng biến môi trường VITE_VOICE_API.

const API = import.meta.env.VITE_VOICE_API ?? "/api/voice-blend";
const LAST_KEY = "ov_last_profile";

async function errorMessage(res) {
  try {
    const j = await res.json();
    if (typeof j.detail === "string") return j.detail;
    if (Array.isArray(j.detail)) {
      // Lỗi xác thực của FastAPI: hiện cả tên trường, ví dụ "profile_id: Field required"
      return j.detail
        .map((d) => {
          const where = Array.isArray(d.loc)
            ? d.loc.filter((x) => x !== "body").join(".")
            : "";
          return where ? `${where}: ${d.msg ?? ""}` : (d.msg ?? "");
        })
        .join("; ");
    }
    return res.statusText;
  } catch {
    return res.statusText;
  }
}

async function ok(res) {
  if (!res.ok) throw new Error(await errorMessage(res));
  return res;
}

// ---------- Giọng nguồn (edge-tts) ----------
export async function listVoices() {
  return (await ok(await fetch(`${API}/voices`))).json(); // [{ id, name }]
}

// ---------- Thư viện giọng tham chiếu đã lưu ----------
/** Danh sách giọng đã lưu trên server: [{ id, name, created_at }], mới nhất trước. */
export async function listProfiles() {
  return (await ok(await fetch(`${API}/profiles`))).json();
}

/** Upload audio tham chiếu và lưu thành giọng có tên. Trả về { profile_id, name }. */
export async function createProfile(fileOrBlob, name = "") {
  const fd = new FormData();
  fd.append("file", fileOrBlob, fileOrBlob.name ?? "reference.wav");
  fd.append("name", name);
  return (
    await ok(await fetch(`${API}/profiles`, { method: "POST", body: fd }))
  ).json();
}

export async function renameProfile(profileId, name) {
  const res = await fetch(`${API}/profiles/${profileId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  return (await ok(res)).json();
}

/**
 * Pha trộn nhiều giọng đã lưu thành một giọng mới và lưu lại.
 * items: [{ profileId, weight }] – trọng số tự được chuẩn hóa (50/50 = weight 1 và 1).
 * Trả về { profile_id, name }.
 */
export async function blendProfiles({ name, items, keepNorm = false }) {
  const res = await fetch(`${API}/profiles/blend`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      items: items.map((i) => ({ profile_id: i.profileId, weight: i.weight })),
      keep_norm: keepNorm,
    }),
  });
  return (await ok(res)).json();
}

export async function deleteProfile(profileId) {
  await ok(await fetch(`${API}/profiles/${profileId}`, { method: "DELETE" }));
  if (getLastProfileId() === profileId) setLastProfileId(null);
}

// Nhớ giọng dùng gần nhất trong trình duyệt để lần sau mở web là dùng được ngay.
export function getLastProfileId() {
  try {
    return localStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
}

export function setLastProfileId(id) {
  try {
    if (id) localStorage.setItem(LAST_KEY, id);
    else localStorage.removeItem(LAST_KEY);
  } catch {
    /* bỏ qua nếu trình duyệt chặn localStorage */
  }
}

// ---------- Tạo giọng nói ----------
/** Trả về object URL dùng cho <audio src=...>. Nhớ URL.revokeObjectURL(url) khi không dùng nữa. */
export async function synthesize({ text, profileId, voice, speed = 1.0 }) {
  const res = await ok(
    await fetch(`${API}/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, profile_id: profileId, voice, speed }),
    }),
  );
  return URL.createObjectURL(await res.blob());
}

/* Ví dụ dùng (React):

const [profiles, setProfiles] = useState([]);
const [profileId, setProfileId] = useState(getLastProfileId());
const [audioUrl, setAudioUrl] = useState(null);

useEffect(() => {
  listProfiles().then((list) => {
    setProfiles(list);
    // nếu giọng đã nhớ không còn trên server thì bỏ chọn
    if (profileId && !list.some((p) => p.id === profileId)) setProfileId(null);
  });
}, []);

async function onPickFile(e) {
  const file = e.target.files[0];
  const { profile_id } = await createProfile(file, 'Giọng của tôi');
  setProfileId(profile_id);
  setLastProfileId(profile_id);
  setProfiles(await listProfiles());
}

async function onGenerate() {
  setAudioUrl(await synthesize({ text, profileId, voice: 'vi-VN-HoaiMyNeural' }));
}

// <select value={profileId ?? ''} onChange={(e) => { setProfileId(e.target.value); setLastProfileId(e.target.value); }}>
//   {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
// </select>
// <input type="file" accept="audio/*" onChange={onPickFile} />  // chỉ cần khi thêm giọng mới
// <button onClick={onGenerate} disabled={!profileId}>Tạo giọng</button>
// {audioUrl && <audio controls src={audioUrl} />}
*/
