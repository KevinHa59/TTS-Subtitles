import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import HealthStatus from "./VoiceBlend/HealthStatus";
import ReferenceVoice from "./VoiceBlend/ReferenceVoice";
import TTSVoice from "./VoiceBlend/TTSVoice";
import BlendVoices from "./VoiceBlend/BlendVoices";
import { Paper, Stack } from "@mui/material";

// Router Express của bạn: app.use("/api/voice-blend", voiceRouter)
// Có thể đổi bằng biến môi trường VITE_VOICE_API trong file .env
const API =
  (import.meta.env.VITE_VOICE_API as string | undefined) ?? "/api/voice-blend";
const LAST_KEY = "ov_last_profile";

type Voice = { id: string; name: string };
type BlendSource = { id: string; weight: number };
type Profile = {
  id: string;
  name: string;
  created_at: number;
  blend?: BlendSource[] | null;
};

async function errorMessage(res: Response): Promise<string> {
  try {
    const j = await res.json();
    if (typeof j.detail === "string") return j.detail;
    if (Array.isArray(j.detail)) {
      // Lỗi xác thực của FastAPI: hiện cả tên trường bị thiếu/sai, ví dụ "profile_id: Field required"
      return j.detail
        .map((d: { msg?: string; loc?: unknown[] }) => {
          const where = Array.isArray(d.loc)
            ? d.loc.filter((x) => x !== "body").join(".")
            : "";
          return where ? `${where}: ${d.msg ?? ""}` : (d.msg ?? "");
        })
        .join("; ");
    }
  } catch {
    /* không phải JSON */
  }
  return `${res.status} ${res.statusText}`;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, init);
  if (!res.ok) throw new Error(await errorMessage(res));
  return (await res.json()) as T;
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

function readLast(): string | null {
  try {
    return localStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
}

const card: CSSProperties = {
  border: "1px solid #bbb",
  borderRadius: 8,
  padding: 16,
  marginBottom: 16,
};
const row: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
  marginBottom: 8,
};

export default function VoiceTest() {
  const [healthOk, setHealthOk] = useState<boolean | null>(null);
  const [healthText, setHealthText] = useState("đang kiểm tra...");
  const [voices, setVoices] = useState<Voice[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [voiceId, setVoiceId] = useState("");
  const [profileId, setProfileId] = useState("");

  const [text, setText] = useState(
    "Xin chào, đây là giọng nói được tạo bằng OpenVoice.",
  );
  const [speed, setSpeed] = useState(1);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);

  // const [file, setFile] = useState<File | null>(null);
  const [newName, setNewName] = useState("");

  const [blendA, setBlendA] = useState("");
  const [blendB, setBlendB] = useState("");
  const [weightA, setWeightA] = useState(50);
  const [blendName, setBlendName] = useState("");
  const [keepNorm, setKeepNorm] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewElapsed, setPreviewElapsed] = useState<number | null>(null);

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Giải phóng URL audio cũ khi có audio mới hoặc khi rời trang
  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // Nhớ giọng đang chọn
  useEffect(() => {
    if (!profileId) return;
    try {
      localStorage.setItem(LAST_KEY, profileId);
    } catch {
      /* bỏ qua */
    }
  }, [profileId]);

  async function refreshProfiles(select?: string) {
    const list = await api<Profile[]>("/profiles");
    setProfiles(list);
    const has = (id?: string | null) => !!id && list.some((p) => p.id === id);
    setProfileId(
      (prev) => [select, prev, readLast()].find(has) ?? list[0]?.id ?? "",
    );
    setBlendA((prev) => (has(prev) ? prev : (list[0]?.id ?? "")));
    setBlendB((prev) =>
      has(prev) ? prev : (list[1]?.id ?? list[0]?.id ?? ""),
    );
  }

  useEffect(() => {
    (async () => {
      try {
        const h = await api<{
          status: string;
          devices: string[];
          version?: string;
        }>("/health");
        setHealthOk(Boolean(h.version));
        setHealthText(
          h.version
            ? `OK - thiết bị: ${h.devices.join(", ")} - API ${h.version}`
            : `API đang chạy là bản CŨ (thiết bị: ${h.devices.join(", ")}). Hãy cập nhật api_server.py rồi khởi động lại run_api.bat.`,
        );
      } catch (e) {
        setHealthOk(false);
        setHealthText(e instanceof Error ? e.message : String(e));
        return;
      }
      try {
        const v = await api<Voice[]>("/voices");
        setVoices(v);
        setVoiceId((prev) => prev || v[0]?.id || "");
        await refreshProfiles();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError(null);
    setInfo(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  // const upload = () =>
  //   run("Đang trích âm sắc...", async () => {
  //     if (!file) throw new Error("Hãy chọn file audio tham chiếu.");
  //     const fd = new FormData();
  //     fd.append("file", file, file.name);
  //     fd.append("name", newName.trim());
  //     const r = await api<{ profile_id: string; name: string }>("/profiles", {
  //       method: "POST",
  //       body: fd,
  //     });
  //     await refreshProfiles(r.profile_id);
  //     setInfo(`Đã lưu giọng "${r.name}".`);
  //     setFile(null);
  //     setNewName("");
  //   });

  const generate = () =>
    run("Đang tạo giọng...", async () => {
      if (!profileId) throw new Error("Chưa chọn giọng tham chiếu.");
      if (!text.trim()) throw new Error("Hãy nhập văn bản.");
      const t0 = performance.now();
      const res = await fetch(`${API}/tts`, {
        ...jsonInit("POST", {
          text,
          profile_id: profileId,
          voice: voiceId,
          speed,
        }),
      });
      if (!res.ok) throw new Error(await errorMessage(res));
      const blob = await res.blob();
      setAudioUrl(URL.createObjectURL(blob));
      setElapsed((performance.now() - t0) / 1000);
    });

  const blendItems = () => [
    { profile_id: blendA, weight: weightA },
    { profile_id: blendB, weight: 100 - weightA },
  ];

  // Nghe thử: pha trộn rồi tạo giọng ngay, KHÔNG lưu giọng mới
  const previewBlend = () =>
    run("Đang tạo bản nghe thử...", async () => {
      if (!blendA || !blendB || blendA === blendB) {
        throw new Error("Hãy chọn hai giọng khác nhau để pha trộn.");
      }
      if (!text.trim())
        throw new Error("Hãy nhập văn bản ở mục 2 để nghe thử.");
      const t0 = performance.now();
      const res = await fetch(
        `${API}/tts`,
        jsonInit("POST", {
          text,
          voice: voiceId,
          speed,
          blend: blendItems(),
          keep_norm: keepNorm,
        }),
      );
      if (!res.ok) throw new Error(await errorMessage(res));
      setPreviewUrl(URL.createObjectURL(await res.blob()));
      setPreviewElapsed((performance.now() - t0) / 1000);
    });

  const blend = () =>
    run("Đang pha trộn...", async () => {
      if (!blendA || !blendB || blendA === blendB) {
        throw new Error("Hãy chọn hai giọng khác nhau để pha trộn.");
      }
      if (!blendName.trim()) throw new Error("Hãy đặt tên cho giọng mới.");
      const r = await api<{ profile_id: string; name: string }>(
        "/profiles/blend",
        jsonInit("POST", {
          name: blendName.trim(),
          items: blendItems(),
          keep_norm: keepNorm,
        }),
      );
      await refreshProfiles(r.profile_id);
      setInfo(`Đã tạo giọng pha trộn "${r.name}" và chọn sẵn.`);
      setBlendName("");
    });

  const rename = () =>
    run("Đang đổi tên...", async () => {
      const current = profiles.find((p) => p.id === profileId);
      const name = window.prompt("Tên mới:", current?.name ?? "")?.trim();
      if (!name) return;
      await api(
        `/profiles/${encodeURIComponent(profileId)}`,
        jsonInit("PATCH", { name }),
      );
      await refreshProfiles(profileId);
    });

  const remove = () =>
    run("Đang xóa...", async () => {
      const current = profiles.find((p) => p.id === profileId);
      if (!window.confirm(`Xóa giọng "${current?.name ?? profileId}"?`)) return;
      await api(`/profiles/${encodeURIComponent(profileId)}`, {
        method: "DELETE",
      });
      setProfileId("");
      await refreshProfiles();
    });

  const nameOf = (id: string) => profiles.find((p) => p.id === id)?.name ?? id;
  const selected = profiles.find((p) => p.id === profileId);
  const disabled = busy !== null;

  return (
    <Stack
      direction={"row"}
      sx={{
        width: "100%",
        height: "100%",

        margin: "0 auto",
        padding: 2,
        gap: 2,
      }}
    >
      <Stack sx={{ flex: 1, overflowY: "auto", gap: 2 }}>
        <HealthStatus API={API} healthOk={healthOk} healthText={healthText} />

        {busy && <p>⏳ {busy}</p>}
        {error && <p style={{ color: "crimson" }}>⚠️ {error}</p>}
        {info && <p style={{ color: "seagreen" }}>✅ {info}</p>}
        <TTSVoice
          disabled={disabled}
          voices={voices}
          voiceId={voiceId}
          speed={speed}
          text={text}
          profileId={profileId}
          audioUrl={audioUrl}
          elapsed={elapsed}
          onVoiceChange={setVoiceId}
          onSpeedChange={setSpeed}
          onTextChange={setText}
          onGenerate={generate}
        />
        <BlendVoices
          disabled={disabled}
          profiles={profiles}
          blendA={blendA}
          blendB={blendB}
          weightA={weightA}
          keepNorm={keepNorm}
          blendName={blendName}
          previewUrl={previewUrl}
          previewElapsed={previewElapsed}
          onBlendAChange={setBlendA}
          onBlendBChange={setBlendB}
          onWeightAChange={setWeightA}
          onKeepNormChange={setKeepNorm}
          onBlendNameChange={setBlendName}
          onPreview={previewBlend}
          onBlend={blend}
        />
      </Stack>
      <Paper sx={{ width: "450px", height: "100%", overflowY: "auto" }}>
        <ReferenceVoice
          profiles={profiles}
          profileId={profileId}
          selected={selected}
          disabled={disabled}
          setProfileId={setProfileId}
          setInfo={setInfo}
          newName={newName}
          setNewName={setNewName}
          rename={rename}
          remove={remove}
          run={run}
          refreshProfiles={refreshProfiles}
        />
      </Paper>
      {/* 

      

      

     */}
    </Stack>
  );
}
