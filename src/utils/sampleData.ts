export const SAMPLE_PROMPT_SRT = `1
00:00:00,133 --> 00:00:04,266
Ca ca, lớn quá, thật nhiều đồ của tiên gia.

2
00:00:04,933 --> 00:00:06,066
Lại đây, Tứ Tử.`;

export const SAMPLE_DIALOGUE_SRT = `1
00:00:01,000 --> 00:00:04,500
Xin chào các bạn, chào mừng đã đến với thế giới thần tiên.

2
00:00:05,200 --> 00:00:08,800
Ca ca, nhìn xem, ngọn núi phía trước cao ngút ngàn mây trắng.

3
00:00:09,500 --> 00:00:12,100
Cẩn thận bước chân, đường lên đỉnh núi rất hiểm trở.

4
00:00:13,000 --> 00:00:15,600
Muội không sợ đâu, có ca ca bảo vệ rồi mà!

5
00:00:16,300 --> 00:00:19,800
Được rồi, chúng ta hãy tăng tốc để kịp đến nơi trước khi hoàng hôn buông xuống.

6
00:00:20,500 --> 00:00:23,900
Nghe nói trong động tiên có cất giấu ngọc tỷ truyền đời ngàn năm.

7
00:00:24,700 --> 00:00:27,200
Đúng vậy, nhưng cũng đầy rẫy cạm bẫy bí ẩn.

8
00:00:28,000 --> 00:00:30,500
Đi thôi, cuộc phiêu lưu thực sự chỉ mới bắt đầu!`;

// 50-item comprehensive testing dataset for Requirement 9.H
export const SAMPLE_TEST_50_SRT = Array.from({ length: 50 }, (_, i) => {
  const startSec = i * 4.5;
  const durSec = 3.2;
  const endSec = startSec + durSec;

  const pad = (n: number, z = 2) => String(n).padStart(z, '0');
  const formatTime = (totalSec: number) => {
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = Math.floor(totalSec % 60);
    const ms = Math.floor((totalSec % 1) * 1000);
    return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
  };

  const vietnameseSentences = [
    'Chào mừng quý vị và các bạn đến với chuỗi bài giảng trí tuệ nhân tạo thế hệ mới.',
    'Hôm nay chúng ta sẽ cùng khám phá mô hình tổng hợp giọng nói thần kinh Piper TTS.',
    'Mô hình Hoài My được huấn luyện trên tập dữ liệu tiếng Việt chất lượng cao.',
    'Công nghệ VITS kết hợp mạng đối nghịch giúp âm thanh phát ra tự nhiên và ấm áp.',
    'Hệ thống có khả năng tự động đồng bộ hóa dòng thời gian với tệp phụ đề SRT.',
    'Mỗi câu thoại được gán nhãn thời gian bắt đầu và kết thúc với độ chính xác cao.',
    'Thuật toán tự động đo đạc độ dài âm thanh thực tế sau khi sinh ngữ âm.',
    'Nếu câu nói dài hơn khoảng thời gian cho phép, bộ xử lý sẽ điều chỉnh tốc độ đọc.',
    'Bộ lọc atempo bảo toàn cao độ giúp giọng đọc giữ trọn vẹn sự êm dịu.',
    'Khoảng lặng giữa các câu thoại được giữ nguyên vẹn để khớp với kịch bản video.',
    'Người dùng có thể nghe thử độc lập từng câu và tinh chỉnh khi cần thiết.',
    'Tiến trình xử lý được cập nhật theo thời gian thực tới giao diện người dùng.',
    'Các sự kiện trong quá trình vận hành được ghi chép chi tiết vào hệ thống nhật ký.',
    'Hệ thống hỗ trợ xuất file âm thanh chất lượng cao định dạng MP3 hoặc WAV.',
    'Âm thanh hoàn chỉnh có thể được ghép nối trực tiếp vào các phần mềm dựng phim.',
    'Điều này giúp tiết kiệm hàng giờ đồng hồ lồng tiếng thủ công cho các nhà sáng tạo.',
    'Đặc biệt, hệ thống hoạt động hoàn toàn offline với bộ máy suy luận ONNX tối ưu.',
    'Tốc độ sinh âm thanh chỉ mất vài trăm mili-giây cho mỗi câu thoại ngắn.',
    'Khả năng ngắt nhịp tự nhiên tại dấu phẩy và nghỉ sâu tại dấu chấm câu.',
    'Giọng đọc Hoài My mang âm sắc truyền cảm, gần gũi như một phát thanh viên thực thụ.',
    'Hệ thống cảnh báo thông minh giúp phát hiện sớm các câu thoại bị chồng lấn thời gian.',
    'Bạn có thể dễ dàng tải lên tệp phụ đề SRT hoặc dán văn bản trực tiếp.',
    'Thanh tiến trình tổng thể hiển thị tỷ lệ phần trăm và thời gian hoàn thành ước tính.',
    'Chức năng thử lại cho phép xử lý lại các câu bị lỗi mà không làm gián đoạn dự án.',
    'Các giai đoạn từ nạp dữ liệu đến ghép timeline được theo dõi chặt chẽ.',
    'Bộ đệm âm thanh PCM bảo đảm tính đồng bộ chính xác đến từng mili-giây.',
    'File âm thanh cuối cùng luôn kéo dài khớp với thời lượng kịch bản mong muốn.',
    'Bạn có thể tùy chỉnh tốc độ đọc tối đa và tối thiểu trong phần cấu hình nâng cao.',
    'Cơ chế ưu tiên giọng tự nhiên giúp bảo toàn trải nghiệm nghe thư thái nhất.',
    'Các câu dài được phân tích ngữ âm tỉ mỉ để tránh hiện tượng mất từ hoặc méo tiếng.',
    'Nhật ký hoạt động có thể được xuất thành tệp văn bản để tiện lưu trữ và phân tích.',
    'Giao diện trực quan cho phép theo dõi đồng thời bảng phụ đề và sóng âm trực quan.',
    'Các phím tắt nhanh giúp thao tác điều khiển diễn ra mượt mà và thuận tiện.',
    'Trình phát âm thanh tích hợp sẵn bộ điều khiển tốc độ và thanh âm lượng chuyên nghiệp.',
    'Người dùng có thể dễ dàng so sánh thời lượng dự kiến và thời lượng thực tế.',
    'Tính năng ghép nối tự động chèn khoảng lặng chuẩn xác ở các đoạn không có lời thoại.',
    'Dữ liệu tạm thời được lưu trữ an toàn trong phiên làm việc của bạn.',
    'Các câu thoại tiếng Việt có dấu thanh phức tạp đều được xử lý chuẩn mực.',
    'Tần số lấy mẫu 22.05 kHz mang đến chất lượng âm thanh trong trẻo và chi tiết.',
    'Hệ thống hỗ trợ nhiều kiểu phụ đề từ phim ảnh, phóng sự cho đến bài giảng điện tử.',
    'Mọi thao tác đều được tự động hóa tối đa để người dùng đạt hiệu suất cao nhất.',
    'Bạn có thể tải về file âm thanh tổng hợp bất cứ lúc nào sau khi hoàn tất.',
    'Nếu gặp sự cố mạng, hệ thống sẽ tự động khôi phục kết nối và cập nhật tiến trình.',
    'Các đoạn phụ đề quá ngắn cũng được xử lý linh hoạt với khoảng đệm âm thanh.',
    'Tính năng xem trước cho phép nghe ngay kết quả của từng phân đoạn nhỏ.',
    'Định dạng xuất mặc định là MP3 để tối ưu dung lượng lưu trữ trên thiết bị.',
    'Tùy chọn WAV không nén dành cho các dự án yêu cầu chất lượng phòng thu cao cấp.',
    'Cảm ơn bạn đã tin tưởng và sử dụng công cụ đồng bộ phụ đề Piper TTS Hoài My.',
    'Chúc bạn có những tác phẩm video và âm thanh thật ấn tượng và thành công!',
    'Hệ thống hoàn tất phiên xử lý và sẵn sàng phục vụ cho các dự án tiếp theo.'
  ];

  const text = vietnameseSentences[i % vietnameseSentences.length];
  return `${i + 1}\n${formatTime(startSec)} --> ${formatTime(endSec)}\n${text}`;
}).join('\n\n');
