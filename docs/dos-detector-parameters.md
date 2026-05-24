# DoS Detector — Giải thích các thông số

## Tổng quan

`DoSDetector` sử dụng kết hợp **Adaptive Threshold**, **Multiple Consecutive Windows**, và **Trust Score** để phát hiện tấn công DoS. Tài liệu này giải thích lý do chọn từng thông số.

---

## 1. Window (`windowMs: 10_000`)

**Giá trị:** 10 giây  
**Loại:** Educated guess — không có nguồn academic cụ thể. Có tham khảo [Detection of HTTP-GET flood Attack Based on Analysis of Page Access Behavior](https://ieeexplore.ieee.org/abstract/document/4313218/)

**Lý do chọn:**

Window size là trade-off giữa 2 yếu tố đối lập:

| Window ngắn | Window dài |
|---|---|
| Detect nhanh hơn | Detect chậm hơn |
| Nhiều false positive hơn | Ít false positive hơn |
| Dễ bị bypass bằng slow attack | Bắt được slow attack tốt hơn |

10 giây được chọn vì nằm ở điểm cân bằng — đủ ngắn để detect burst attack nhanh, đủ dài để tránh false positive với traffic burst ngẫu nhiên. Giá trị tối ưu cần được xác định qua thực nghiệm với traffic thực tế của từng ứng dụng.

Hệ thống dùng **3 consecutive windows** liên tiếp (30 giây tổng) thay vì 1 window đơn, giúp phân biệt burst ngẫu nhiên với sustained attack:

```
window0: [now-10s → now]       weight 0.5
window1: [now-20s → now-10s]   weight 0.3
window2: [now-30s → now-20s]   weight 0.2
```

---

## 2. Base Threshold (`baseThreshold: 100`)

**Giá trị:** 100 request/10 giây  
**Nguồn:** Dựa trên OWASP và Cloudflare

Theo [OWASP Denial of Service Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Denial_of_Service_Cheat_Sheet.html):

> Threshold nên được xác định dựa trên baseline traffic thực tế, không có con số cố định cho mọi ứng dụng.

Theo [Cloudflare Rate Limiting Best Practices](https://developers.cloudflare.com/waf/rate-limiting-rules/best-practices/), ví dụ điển hình cho endpoint thông thường là ~10 request/giây/IP.

**Công thức:**
```
User bình thường: ~1-2 req/s (theo Cloudflare documentation)
Threshold = 10x baseline = 10 req/s = 100 req/10s
```

Hệ số nhân 10x là convention phổ biến trong IDS — đủ để không block user hợp lệ có traffic cao, nhưng vẫn detect được flood attack.

> ⚠️ **Lưu ý:** Trong môi trường production, threshold nên được xác định bằng cách quan sát traffic thực tế trong 1-2 tuần trước khi bật detection.

---

## 3. Window Weights (`window0Weight: 0.5, window1Weight: 0.3, window2Weight: 0.2`)

**Loại:** Educated guess — không có nguồn academic cụ thể

**Lý do chọn:**

Weights được thiết kế theo nguyên tắc **exponential decay** — dữ liệu càng gần hiện tại càng có giá trị hơn trong việc đánh giá hành vi hiện tại của IP.

```
Anomaly score = ratio0 × 0.5 + ratio1 × 0.3 + ratio2 × 0.2
```

Tổng weights = 1.0 để score nằm trong khoảng [0, 1], dễ interpret và compare với `anomalyScoreToPenalize`.

**Ví dụ minh họa:**
```
Burst ngẫu nhiên:  ratio0=0.9, ratio1=0.1, ratio2=0.0
→ score = 0.9×0.5 + 0.1×0.3 + 0.0×0.2 = 0.48 → không penalize

Sustained attack:  ratio0=0.9, ratio1=0.9, ratio2=0.8
→ score = 0.9×0.5 + 0.9×0.3 + 0.8×0.2 = 0.88 → penalize
```

---

## 4. Anomaly Score Threshold (`anomalyScoreToPenalize: 0.7`)

**Loại:** Educated guess — không có nguồn academic cụ thể

**Lý do chọn:**

0.7 có nghĩa là IP phải vượt 70% threshold trên weighted average của các windows mới bị penalize. Được chọn để:

- Đủ cao để tránh false positive với traffic burst ngẫu nhiên
- Đủ thấp để detect sustained attack kịp thời

Với window weights hiện tại, một IP chỉ bị penalize khi window hiện tại (window0) **và** ít nhất 1 window trước đó đều có traffic cao — tránh penalize burst ngắn hạn.

---

## 5. Trust Score (`initialTrustScore: 50, blockTrustThreshold: 20, trustPenaltyOnAnomaly: 15`)

**Loại:** Educated guess, thiết kế theo logic cụ thể

**Lý do chọn:**

Trust score được thiết kế để IP mới cần bị flag **ít nhất 3 lần liên tiếp** mới bị block:

```
initialTrustScore = 50
trustPenaltyOnAnomaly = 15

Lần 1 bị flag: 50 - 15 = 35  → chưa block (35 > 20)
Lần 2 bị flag: 35 - 15 = 20  → chưa block (20 = 20, không < 20)
Lần 3 bị flag: 20 - 15 = 5   → BLOCK (5 < 20)
```

Yêu cầu 3 lần vi phạm giúp tránh block nhầm user hợp lệ do burst ngắn hạn.

**Trust Recovery (`trustRewardOnNormal: 1` mỗi 5 giây):**

IP behave tốt sẽ recover trust theo tốc độ:
```
Từ suspicious (trust=20) lên trusted (trust=70):
(70 - 20) / 1 × 5s = 250 giây ≈ 4 phút behave tốt liên tục
```

4 phút được chọn vì đủ để đảm bảo IP thực sự đã ngừng tấn công trước khi được nới lỏng.

---

## 6. Trust Tiers (`trustedTrustScore: 70, neutralTrustScore: 40`)

**Loại:** Educated guess

**Lý do chọn:**

3 tiers chia đều khoảng [0, 100]:

| Tier | Range | Ý nghĩa |
|---|---|---|
| Trusted | 70-100 | IP lâu năm, behave tốt — không bị ảnh hưởng bởi CPU |
| Neutral | 40-70 | IP mới hoặc chưa rõ — bị ảnh hưởng nhẹ khi CPU cao |
| Suspicious | 0-40 | IP có dấu hiệu bất thường — bị siết chặt khi CPU cao |

Mục tiêu: khi server bị stress (CPU cao do attack), chỉ siết IP suspicious — không vô tình block user tin cậy.

---

## 7. CPU Thresholds (`cpuHighThreshold: 0.80, cpuCriticalThreshold: 0.90`)

**Nguồn:** SRE/DevOps industry standard

80% và 90% là ngưỡng cảnh báo/critical phổ biến trong hầu hết monitoring system:

- [Google SRE Book — Alerting on SLOs](https://sre.google/workbook/alerting-on-slos/)
- [Prometheus Alerting Rules — Node Exporter](https://samber.github.io/awesome-prometheus-alerts/rules#host-and-hardware)
- [CISCO CPU Thresholding Notification](https://www.cisco.com/c/en/us/td/docs/ios-xml/ios/bsm/configuration/15-1s/bsm-cpu-thresh-notif.html)

Khi CPU vượt ngưỡng, `globalBaseThreshold` bị giảm **chỉ cho IP suspicious** — không ảnh hưởng IP trusted/neutral, tránh collateral damage.

---

## 8. Grace Period (`gracePeriodMs: 60_000`)

**Loại:** Educated guess

**Lý do chọn:**

IP mới (chưa đủ 1 phút) chưa có đủ lịch sử để build baseline — không nên apply CPU-based throttling cho họ. 60 giây là đủ để:

- Accumulate ít nhất 6 window cycles (10s × 6)
- Có data từ cả 3 consecutive windows
- Phân biệt được burst ngắn với sustained pattern

---

## 9. Cleanup (`inactiveTimeoutMs: 30 phút`)

**Loại:** Educated guess

IP không có request trong 30 phút được xóa khỏi memory. 30 phút được chọn vì:

- Đủ dài để giữ profile của user đang browse chậm
- Đủ ngắn để tránh memory leak khi có nhiều IP unique

---

## Tóm tắt nguồn

| Thông số | Nguồn |
|---|---|
| `baseThreshold` | [OWASP DoS Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Denial_of_Service_Cheat_Sheet.html), [Cloudflare Rate Limiting](https://developers.cloudflare.com/waf/rate-limiting-rules/best-practices/) |
| `cpuHighThreshold`, `cpuCriticalThreshold` | [Google SRE Book](https://sre.google/workbook/alerting-on-slos/), [Prometheus Alerting](https://samber.github.io/awesome-prometheus-alerts/rules#host-and-hardware) |
| `windowMs` | Educated guess — trade-off giữa sensitivity và false positive rate + [Detection of HTTP-GET flood Attack Based on Analysis of Page Access Behavior](https://ieeexplore.ieee.org/abstract/document/4313218/) |
| `window*Weight` | Educated guess — nguyên tắc exponential decay |
| `anomalyScoreToPenalize` | Educated guess |
| `initialTrustScore`, `blockTrustThreshold`, `trustPenaltyOnAnomaly` | Thiết kế theo logic "cần N lần vi phạm mới block" |
| `trustRewardOnNormal` | Thiết kế theo thời gian recover mong muốn (~4 phút) |
| `trustedTrustScore`, `neutralTrustScore` | Educated guess — chia 3 tiers đều |
| `gracePeriodMs` | Educated guess |
| `inactiveTimeoutMs` | Educated guess |
