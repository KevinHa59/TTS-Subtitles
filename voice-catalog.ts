export interface VoiceDefinition {
  id: string;
  modelId: string;
  speakerId?: number;
  name: string;
  tag: string;
  gender: "female" | "male" | "neutral";
  description: string;
  sampleText: string;
  recommended: boolean;
}

export const DEFAULT_MODEL = "hub:hoaimy-vietnamese-vi-medium-ljkjhi";
export const CSA_VOICE_MODEL_ID = "local:vi_VN-csa-voice-piper-v3-medium";

export const LOCAL_MODEL_FILES: Record<string, string> = {
  [CSA_VOICE_MODEL_ID]: "vi_VN-csa-voice-piper-v3-medium.onnx",
};

export const AVAILABLE_MODELS: VoiceDefinition[] = [
  {
    id: DEFAULT_MODEL,
    modelId: DEFAULT_MODEL,
    name: "Hoài My (Khuyên Dùng)",
    tag: "Nữ · Miền Bắc · Chuẩn & Truyền cảm",
    gender: "female",
    description:
      "Giọng đọc nữ tự nhiên, tròn vành rõ chữ, âm sắc ấm áp và biểu cảm tự nhiên.",
    sampleText:
      "Xin chào, tôi là Hoài My. Rất hân hạnh được đồng hành cùng bạn với công nghệ Piper TTS.",
    recommended: true,
  },
  {
    id: "hub:hoaimy-vietnamese-vi-congchualong",
    modelId: "hub:hoaimy-vietnamese-vi-congchualong",
    name: "Hoài My (Phiên bản Dịu êm)",
    tag: "Nữ · Miền Bắc · Thanh thoát, dịu dàng",
    gender: "female",
    description:
      "Phong cách nhẹ nhàng, thư giãn, rất hợp với nội dung tản văn hoặc hướng dẫn thiền.",
    sampleText: "Chào bạn, chúc bạn một buổi tối thật bình yên và thư thái.",
    recommended: false,
  },
  {
    id: "hub:hoaimy-vietnamese-vi-nmh19xx",
    modelId: "hub:hoaimy-vietnamese-vi-nmh19xx",
    name: "Hoài My (Phiên bản Podcast)",
    tag: "Nữ · Miền Bắc · Trầm ấm, sâu lắng",
    gender: "female",
    description:
      "Tông giọng đầm và ấm, phù hợp đọc sách nói, tâm sự hoặc bản tin radio.",
    sampleText:
      "Chào mừng quý thính giả đang lắng nghe chương trình radio đêm muộn.",
    recommended: false,
  },
  {
    id: "hub:ban-mai-vietnamese-vi-medium",
    modelId: "hub:ban-mai-vietnamese-vi-medium",
    name: "Ban Mai",
    tag: "Nữ · Miền Bắc · Trong trẻo, năng động",
    gender: "female",
    description:
      "Giọng nữ trẻ trung, tươi sáng, thích hợp cho video tin tức ngắn và thông báo công cộng.",
    sampleText:
      "Bản tin sáng nay xin gửi tới quý vị và các bạn những tin tức mới nhất.",
    recommended: false,
  },
  {
    id: "hub:thanh-nien-tu-tin-vietnamese-vi-medium",
    modelId: "hub:thanh-nien-tu-tin-vietnamese-vi-medium",
    name: "Thanh Niên Tự Tin",
    tag: "Nam · Miền Bắc · Chững chạc, dõng dạc",
    gender: "male",
    description:
      "Giọng nam dứt khoát, uy tín, phù hợp bài giảng điện tử và phóng sự tài liệu.",
    sampleText:
      "Kính chào quý vị khán giả, xin mời theo dõi nội dung chuyên đề khoa học công nghệ.",
    recommended: false,
  },
  {
    id: "hub:viet-thao-vietnamese-vi-medium",
    modelId: "hub:viet-thao-vietnamese-vi-medium",
    name: "Việt Thảo",
    tag: "Nam · Miền Nam · Hóm hỉnh, sống động",
    gender: "male",
    description: "Âm sắc miền Nam tự nhiên, gần gũi, cuốn hút người nghe.",
    sampleText:
      "Xin kính chào quý vị và các bạn đã quay trở lại với chương trình ngày hôm nay.",
    recommended: false,
  },
  {
    id: "hub:huyenngoc-vietnamese-vi-medium-ljkjhi",
    modelId: "hub:huyenngoc-vietnamese-vi-medium-ljkjhi",
    name: "Huyền Ngọc",
    tag: "Nữ · Miền Bắc · Tự nhiên, gần gũi",
    gender: "female",
    description: "Âm sắc miền Bắc tự nhiên, gần gũi, cuốn hút người nghe.",
    sampleText:
      "Xin kính chào quý vị và các bạn đã quay trở lại với chương trình ngày hôm nay.",
    recommended: false,
  },
  {
    id: "hub:duy-onyx-vietnamese-vi-medium",
    modelId: "hub:duy-onyx-vietnamese-vi-medium",
    name: "Duy Onyx",
    tag: "Nam · Miền Bắc · Tự nhiên, gần gũi",
    gender: "male",
    description: "Âm sắc miền Bắc tự nhiên, gần gũi, cuốn hút người nghe.",
    sampleText:
      "Xin kính chào quý vị và các bạn đã quay trở lại với chương trình ngày hôm nay.",
    recommended: false,
  },
  {
    id: "hub:doanhdoanh-vietnamese-vi-congchualong",
    modelId: "hub:doanhdoanh-vietnamese-vi-congchualong",
    name: "Doanh Doanh",
    tag: "Nữ · Miền Nam · Tự nhiên, gần gũi",
    gender: "female",
    description: "Âm sắc miền Nam tự nhiên, gần gũi, cuốn hút người nghe.",
    sampleText:
      "Xin kính chào quý vị và các bạn đã quay trở lại với chương trình ngày hôm nay.",
    recommended: false,
  },
  {
    id: "hub:dungdien-vietnamese-vi-congchualong",
    modelId: "hub:dungdien-vietnamese-vi-congchualong",
    name: "Dung Dien",
    tag: "Nữ · Miền Nam · Tự nhiên, gần gũi",
    gender: "female",
    description: "Âm sắc miền Nam tự nhiên, gần gũi, cuốn hút người nghe.",
    sampleText:
      "Xin kính chào quý vị và các bạn đã quay trở lại với chương trình ngày hôm nay.",
    recommended: false,
  },
  {
    id: "hub:yan3d-vietnamese-vi-medium",
    modelId: "hub:yan3d-vietnamese-vi-medium",
    name: "Yan 3D",
    tag: "Nữ · Miền Nam · Tự nhiên, gần gũi",
    gender: "female",
    description: "Âm sắc miền Nam tự nhiên, gần gũi, cuốn hút người nghe.",
    sampleText:
      "Xin kính chào quý vị và các bạn đã quay trở lại với chương trình ngày hôm nay.",
    recommended: false,
  },
  {
    id: "hub:ngoc-ngan-vietnamese-vi-medium",
    modelId: "hub:ngoc-ngan-vietnamese-vi-medium",
    name: "Nguyễn Ngọc Ngạn",
    tag: "Nữ · Miền Bắc 54 · Tự nhiên, gần gũi",
    gender: "female",
    description: "Âm sắc miền Nam tự nhiên, gần gũi, cuốn hút người nghe.",
    sampleText:
      "Xin kính chào quý vị và các bạn đã quay trở lại với chương trình ngày hôm nay.",
    recommended: false,
  },
  {
    id: "hub:ngochuyen-vietnamese-vi-medium",
    modelId: "hub:ngochuyen-vietnamese-vi-medium",
    name: "Ngọc Huyền",
    tag: "Nữ · Miền Bắc· Tự nhiên, gần gũi",
    gender: "female",
    description: "Âm sắc miền Nam tự nhiên, gần gũi, cuốn hút người nghe.",
    sampleText:
      "Xin kính chào quý vị và các bạn đã quay trở lại với chương trình ngày hôm nay.",
    recommended: false,
  },
  {
    id: `${CSA_VOICE_MODEL_ID}:speaker-0`,
    modelId: CSA_VOICE_MODEL_ID,
    speakerId: 0,
    name: "Ngọc Lan",
    tag: "Nữ · Miền Bắc · CSA Voice",
    gender: "female",
    description: "Giọng nữ miền Bắc của CSA Voice (speaker ID 0).",
    sampleText: "Xin chào, tôi là Ngọc Lan.",
    recommended: false,
  },
  {
    id: `${CSA_VOICE_MODEL_ID}:speaker-1`,
    modelId: CSA_VOICE_MODEL_ID,
    speakerId: 1,
    name: "Minh Anh",
    tag: "Nữ · Miền Bắc · CSA Voice",
    gender: "female",
    description: "Giọng nữ miền Bắc của CSA Voice (speaker ID 1).",
    sampleText: "Xin chào, tôi là Minh Anh.",
    recommended: false,
  },
  {
    id: `${CSA_VOICE_MODEL_ID}:speaker-2`,
    modelId: CSA_VOICE_MODEL_ID,
    speakerId: 2,
    name: "Quang Huy",
    tag: "Nam · Miền Bắc · CSA Voice",
    gender: "male",
    description: "Giọng nam miền Bắc của CSA Voice (speaker ID 2).",
    sampleText: "Xin chào, tôi là Quang Huy.",
    recommended: false,
  },
  {
    id: `${CSA_VOICE_MODEL_ID}:speaker-3`,
    modelId: CSA_VOICE_MODEL_ID,
    speakerId: 3,
    name: "Thu Hà",
    tag: "Nữ · Miền Bắc · CSA Voice",
    gender: "female",
    description: "Giọng nữ miền Bắc của CSA Voice (speaker ID 3).",
    sampleText: "Xin chào, tôi là Thu Hà.",
    recommended: false,
  },
  {
    id: `${CSA_VOICE_MODEL_ID}:speaker-4`,
    modelId: CSA_VOICE_MODEL_ID,
    speakerId: 4,
    name: "Yến Nhi",
    tag: "Nữ · Miền Nam · CSA Voice",
    gender: "female",
    description: "Giọng nữ miền Nam của CSA Voice (speaker ID 4).",
    sampleText: "Xin chào, tôi là Yến Nhi.",
    recommended: false,
  },
];
