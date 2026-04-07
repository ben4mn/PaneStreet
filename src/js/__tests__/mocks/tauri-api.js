// Mock Tauri API modules (tray, image) for testing

export class TrayIcon {
  constructor(rid, id) { this.rid = rid; this.id = id; }
  static async getById(id) { return new TrayIcon(1, id); }
  static async new(options) { return new TrayIcon(1, options?.id || 'test'); }
  async setIcon(icon) {}
  async setTooltip(tooltip) {}
}

export class Image {
  constructor(rid) { this.rid = rid; }
  static async new(rgba, width, height) { return new Image(1); }
  static async fromBytes(bytes) { return new Image(1); }
  static async fromPath(path) { return new Image(1); }
}

export function transformImage(image) { return image; }
