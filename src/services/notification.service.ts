import notifier, { NotificationCallback } from 'node-notifier'
import path from 'path'

type NotificationEvent = 'click' | 'timeout' | 'close'

// ─── Rate Limiting ───────────────────────────────────────────────────────
// Prevents notification spam by enforcing a minimum interval between notifications.
const lastNotificationTime = new Map<string, number>()
const NOTIFICATION_COOLDOWN_MS = 1_000 // 1 seconds cooldown per alert type
 
export class NotificationService {
  constructor() {
    // Gắn event listeners một lần duy nhất ở constructor
    this.setupListeners()
  }
 
  /**
   * Gửi Windows Toast Notification khi phát hiện DoS.
   */
  notify(ip: string): void {
    const now = Date.now()
    const lastTime = lastNotificationTime.get(`dos:${ip}`) || 0

    if (now - lastTime < NOTIFICATION_COOLDOWN_MS) return

    lastNotificationTime.set(`dos:${ip}`, now)

    notifier.notify({
      appID:   'DoS Detection System',  // Windows dùng appID, không phải appName
      title:   '⚠️ Phát hiện tấn công DoS',
      message: `IP ${ip} đã bị block tự động.\nVào dashboard để quản lý.`,
      icon:    path.join(__dirname, 'assets', 'warning.png'),
      sound:   true,
      wait:    true,  // cần true để nhận được click/close events
    })
  }

  /**
   * Gửi Windows Toast Notification khi phát hiện DDoS.
   */
  notifyDDoS(type: string, message: string): void {
    const now = Date.now()
    const lastTime = lastNotificationTime.get(`ddos:${type}`) || 0

    if (now - lastTime < NOTIFICATION_COOLDOWN_MS) return

    lastNotificationTime.set(`ddos:${type}`, now)

    notifier.notify({
      appID:   'DDoS Detection System',
      title:   `🚨 Phát hiện tấn công DDoS (${type})`,
      message: message,
      icon:    path.join(__dirname, 'assets', 'warning.png'), // có thể dùng icon khác nếu có
      sound:   true,
      wait:    true,
    })
  }

  /**
   * Đăng ký event listener cho notification.
   * Có thể dùng để mở dashboard khi admin click vào notification.
   */
  on(event: NotificationEvent, callback: NotificationCallback): this {
    notifier.on(event, callback)
    return this  // chainable
  }
 
  off(event: NotificationEvent, callback: NotificationCallback): this {
    notifier.removeListener(event, callback)
    return this
  }
 
  private setupListeners(): void {
    // Log khi admin click vào notification
    notifier.on('click', (_notifierObject, _options, event) => {
      console.info('[Notification] Admin đã click vào notification', event)
      // TODO: mở dashboard URL khi có
      // open('http://localhost:3000/dashboard')
    })
 
    // Log khi notification timeout (admin không phản hồi)
    notifier.on('timeout', () => {
      console.info('[Notification] Notification đã timeout, admin không phản hồi')
    })
 
    notifier.on('close', () => {
      console.info('[Notification] Admin đã đóng notification')
    })
  }
}

export const notificationService = new NotificationService()