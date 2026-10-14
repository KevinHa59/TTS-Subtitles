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

export const DEFAULT_MODEL = "local:hoaimy-vietnamese-vi-medium-ljkjhi";
export const CSA_VOICE_MODEL_ID = "local:vi_VN-csa-voice-piper-v3-medium";

// Mapping from local model ID to corresponding .onnx file(s) in /models directory
export const LOCAL_MODEL_FILES: Record<string, string | string[]> = {
  "local:hoaimy-vietnamese-vi-medium-ljkjhi": "hoaimy-vietnamese-vi-medium-ljkjhi.onnx",
  "local:hoaimy-vietnamese-vi-congchualong": "hoaimy-vietnamese-vi-congchualong.onnx",
  "local:hoaimy-vietnamese-vi-nmh19xx": "hoaimy-vietnamese-vi-nmh19xx.onnx",
  "local:ban-mai-vietnamese-vi-medium": "ban-mai-vietnamese-vi-medium.onnx",
  "local:thanh-nien-tu-tin-vietnamese-vi-medium": "thanh-nien-tu-tin-vietnamese-vi-medium.onnx",
  "local:viet-thao-vietnamese-vi-medium": "viet-thao-vietnamese-vi-medium.onnx",
  "local:huyenngoc-vietnamese-vi-medium-ljkjhi": [
    "huyenngoc-vietnamese-vi-medium-ljkjhi.onnx",
    "voices_huyenngoc.onnx",
  ],
  "local:duy-onyx-vietnamese-vi-medium": [
    "duy-onyx-vietnamese-vi-medium.onnx",
    "vi-Duy Onyx (new).onnx",
  ],
  "local:doanhdoanh-vietnamese-vi-congchualong": [
    "doanhdoanh.onnx",
    "doanhdoanh-vietnamese-vi-congchualong.onnx",
  ],
  "local:dungdien-vietnamese-vi-congchualong": [
    "dungdien.onnx",
    "dungdien-vietnamese-vi-congchualong.onnx",
  ],
  "local:yan3d-vietnamese-vi-medium": [
    "yan3d-vietnamese-vi-medium.onnx",
    "yannew.onnx",
  ],
  "local:ngoc-ngan-vietnamese-vi-medium": [
    "ngocngan3701.onnx",
    "ngoc-ngan-vietnamese-vi-medium.onnx",
  ],
  "local:ngochuyen-vietnamese-vi-medium": [
    "ngochuyen.onnx",
    "ngochuyen-vietnamese-vi-medium.onnx",
  ],
  [CSA_VOICE_MODEL_ID]: "vi_VN-csa-voice-piper-v3-medium.onnx",
};

export const AVAILABLE_MODELS: VoiceDefinition[] = [
  {
    id: DEFAULT_MODEL,
    modelId: DEFAULT_MODEL,
    name: "Hoài My (Khuyên Dùng)",
    tag: "Nữ · Miền Bắc · Chuẩn & Truyền cảm (Offline)",
    gender: "female",
    description:
      "Giọng đọc nữ tự nhiên, tròn vành rõ chữ, âm sắc ấm áp và biểu cảm tự nhiên.",
    sampleText:
      "Xin chào, tôi là Hoài My. Rất hân hạnh được đồng hành cùng bạn với công nghệ Piper TTS.",
    recommended: true,
  },
  {
    id: "local:hoaimy-vietnamese-vi-congchualong",
    modelId: "local:hoaimy-vietnamese-vi-congchualong",
    name: "Hoài My (Phiên bản Dịu êm)",
    tag: "Nữ · Miền Bắc · Thanh thoát, dịu dàng (Offline)",
    gender: "female",
    description:
      "Phong cách nhẹ nhàng, thư giãn, rất hợp với nội dung tản văn hoặc hướng dẫn thiền.",
    sampleText: "Chào bạn, chúc bạn một buổi tối thật bình yên và thư thái.",
    recommended: false,
  },
  {
    id: "local:hoaimy-vietnamese-vi-nmh19xx",
    modelId: "local:hoaimy-vietnamese-vi-nmh19xx",
    name: "Hoài My (Phiên bản Podcast)",
    tag: "Nữ · Miền Bắc · Trầm ấm, sâu lắng (Offline)",
    gender: "female",
    description:
      "Tông giọng đầm và ấm, phù hợp đọc sách nói, tâm sự hoặc bản tin radio.",
    sampleText:
      "Chào mừng quý thính giả đang lắng nghe chương trình radio đêm muộn.",
    recommended: false,
  },
  {
    id: "local:ban-mai-vietnamese-vi-medium",
    modelId: "local:ban-mai-vietnamese-vi-medium",
    name: "Ban Mai",
    tag: "Nữ · Miền Bắc · Trong trẻo, năng động (Offline)",
    gender: "female",
    description:
      "Giọng nữ trẻ trung, tươi sáng, thích hợp cho video tin tức ngắn và thông báo công cộng.",
    sampleText:
      "Bản tin sáng nay xin gửi tới quý vị và các bạn những tin tức mới nhất.",
    recommended: false,
  },
  {
    id: "local:thanh-nien-tu-tin-vietnamese-vi-medium",
    modelId: "local:thanh-nien-tu-tin-vietnamese-vi-medium",
    name: "Thanh Niên Tự Tin",
    tag: "Nam · Miền Bắc · Chững chạc, dõng dạc (Offline)",
    gender: "male",
    description:
      "Giọng nam dứt khoát, uy tín, phù hợp bài giảng điện tử và phóng sự tài liệu.",
    sampleText:
      "Kính chào quý vị khán giả, xin mời theo dõi nội dung chuyên đề khoa học công nghệ.",
    recommended: false,
  },
  {
    id: "local:viet-thao-vietnamese-vi-medium",
    modelId: "local:viet-thao-vietnamese-vi-medium",
    name: "Việt Thảo",
    tag: "Nam · Miền Nam · Hóm hỉnh, sống động (Offline)",
    gender: "male",
    description: "Âm sắc miền Nam tự nhiên, gần gũi, cuốn hút người nghe.",
    sampleText:
      "Xin kính chào quý vị và các bạn đã quay trở lại với chương trình ngày hôm nay.",
    recommended: false,
  },
  {
    id: "local:huyenngoc-vietnamese-vi-medium-ljkjhi",
    modelId: "local:huyenngoc-vietnamese-vi-medium-ljkjhi",
    name: "Huyền Ngọc",
    tag: "Nữ · Miền Bắc · Tự nhiên, gần gũi (Offline)",
    gender: "female",
    description: "Âm sắc miền Bắc tự nhiên, thanh thoát, cuốn hút người nghe.",
    sampleText:
      "Xin kính chào quý vị và các bạn đã quay trở lại với chương trình ngày hôm nay.",
    recommended: false,
  },
  {
    id: "local:duy-onyx-vietnamese-vi-medium",
    modelId: "local:duy-onyx-vietnamese-vi-medium",
    name: "Duy Onyx",
    tag: "Nam · Miền Bắc · Tự nhiên, gần gũi (Offline)",
    gender: "male",
    description: "Âm sắc miền Bắc nam tính, trầm ấm, biểu cảm tự nhiên.",
    sampleText:
      "Xin kính chào quý vị và các bạn đã quay trở lại với chương trình ngày hôm nay.",
    recommended: false,
  },
  {
    id: "local:doanhdoanh-vietnamese-vi-congchualong",
    modelId: "local:doanhdoanh-vietnamese-vi-congchualong",
    name: "Doanh Doanh",
    tag: "Nữ · Miền Nam · Nhẹ nhàng, tự nhiên (Offline)",
    gender: "female",
    description: "Âm sắc miền Nam nữ tính, nhẹ nhàng và cuốn hút.",
    sampleText:
      "Xin kính chào quý vị và các bạn đã quay trở lại với chương trình ngày hôm nay.",
    recommended: false,
  },
  {
    id: "local:dungdien-vietnamese-vi-congchualong",
    modelId: "local:dungdien-vietnamese-vi-congchualong",
    name: "Dung Dien",
    tag: "Nữ · Miền Nam · Tự nhiên, gần gũi (Offline)",
    gender: "female",
    description: "Giọng nữ miền Nam mộc mạc, gần gũi, dễ nghe.",
    sampleText:
      "Xin kính chào quý vị và các bạn đã quay trở lại với chương trình ngày hôm nay.",
    recommended: false,
  },
  {
    id: "local:yan3d-vietnamese-vi-medium",
    modelId: "local:yan3d-vietnamese-vi-medium",
    name: "Yan 3D",
    tag: "Nữ · Miền Nam · Hiện đại, sống động (Offline)",
    gender: "female",
    description: "Âm sắc miền Nam hiện đại, sống động, thích hợp review phim & truyện tranh.",
    sampleText:
      "Xin kính chào quý vị và các bạn đã quay trở lại với chương trình ngày hôm nay.",
    recommended: false,
  },
  {
    id: "local:ngoc-ngan-vietnamese-vi-medium",
    modelId: "local:ngoc-ngan-vietnamese-vi-medium",
    name: "Nguyễn Ngọc Ngạn",
    tag: "Nam · Bắc 54 / Hải ngoại · Truyền cảm (Offline)",
    gender: "male",
    description: "Phong cách đọc truyện đêm khuya truyền cảm, giọng Bắc 54 đặc trưng.",
    sampleText:
      "Xin kính chào quý vị thính giả đã theo dõi câu chuyện đêm nay.",
    recommended: false,
  },
  {
    id: "local:ngochuyen-vietnamese-vi-medium",
    modelId: "local:ngochuyen-vietnamese-vi-medium",
    name: "Ngọc Huyền",
    tag: "Nữ · Miền Bắc · Ngọt ngào, truyền cảm (Offline)",
    gender: "female",
    description: "Âm sắc miền Bắc trong trẻo, biểu cảm ngọt ngào.",
    sampleText:
      "Xin kính chào quý vị và các bạn đã quay trở lại với chương trình ngày hôm nay.",
    recommended: false,
  },
  {
    id: `${CSA_VOICE_MODEL_ID}:speaker-0`,
    modelId: CSA_VOICE_MODEL_ID,
    speakerId: 0,
    name: "Ngọc Lan (CSA Voice)",
    tag: "Nữ · Miền Bắc · CSA Multi-speaker (Offline)",
    gender: "female",
    description: "Giọng nữ miền Bắc của CSA Voice (speaker ID 0).",
    sampleText: "Xin chào, tôi là Ngọc Lan.",
    recommended: false,
  },
  {
    id: `${CSA_VOICE_MODEL_ID}:speaker-1`,
    modelId: CSA_VOICE_MODEL_ID,
    speakerId: 1,
    name: "Minh Anh (CSA Voice)",
    tag: "Nữ · Miền Bắc · CSA Multi-speaker (Offline)",
    gender: "female",
    description: "Giọng nữ miền Bắc của CSA Voice (speaker ID 1).",
    sampleText: "Xin chào, tôi là Minh Anh.",
    recommended: false,
  },
  {
    id: `${CSA_VOICE_MODEL_ID}:speaker-2`,
    modelId: CSA_VOICE_MODEL_ID,
    speakerId: 2,
    name: "Quang Huy (CSA Voice)",
    tag: "Nam · Miền Bắc · CSA Multi-speaker (Offline)",
    gender: "male",
    description: "Giọng nam miền Bắc của CSA Voice (speaker ID 2).",
    sampleText: "Xin chào, tôi là Quang Huy.",
    recommended: false,
  },
  {
    id: `${CSA_VOICE_MODEL_ID}:speaker-3`,
    modelId: CSA_VOICE_MODEL_ID,
    speakerId: 3,
    name: "Thu Hà (CSA Voice)",
    tag: "Nữ · Miền Bắc · CSA Multi-speaker (Offline)",
    gender: "female",
    description: "Giọng nữ miền Bắc của CSA Voice (speaker ID 3).",
    sampleText: "Xin chào, tôi là Thu Hà.",
    recommended: false,
  },
  {
    id: `${CSA_VOICE_MODEL_ID}:speaker-4`,
    modelId: CSA_VOICE_MODEL_ID,
    speakerId: 4,
    name: "Yến Nhi (CSA Voice)",
    tag: "Nữ · Miền Nam · CSA Multi-speaker (Offline)",
    gender: "female",
    description: "Giọng nữ miền Nam của CSA Voice (speaker ID 4).",
    sampleText: "Xin chào, tôi là Yến Nhi.",
    recommended: false,
  },
];
