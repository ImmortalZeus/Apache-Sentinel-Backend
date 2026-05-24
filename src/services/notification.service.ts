import notifier, { NotificationCallback } from 'node-notifier'
import path from 'path'

type NotificationEvent = 'click' | 'timeout' | 'close'
 
export class NotificationService {
  constructor() {
    this.setupListeners()
  }
 
  /**
   * Gửi Windows Toast Notification khi phát hiện DoS.
   */
  notify(ip: string): void {
    notifier.notify({
      appID:   'DoS Detection System',
      title:   '⚠️ Phát hiện tấn công DoS',
      message: `IP ${ip} đã bị block tự động.\nVào dashboard để quản lý.`,
      icon:    path.join(__dirname, 'assets', 'warning.png'),
      sound:   true,
      wait:    true,  // cần true để nhận được click/close events
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