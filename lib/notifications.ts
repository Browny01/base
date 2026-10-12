export type NotificationAdapter = {
  permission: () => Promise<NotificationPermission>;
  request: () => Promise<NotificationPermission>;
  send: (title: string, body: string) => Promise<void>;
};
let adapter: NotificationAdapter | null = null;
export function installNotifications(next: NotificationAdapter) {
  adapter = next;
}
const browser: NotificationAdapter = {
  async permission() {
    return typeof Notification === "undefined"
      ? "denied"
      : Notification.permission;
  },
  async request() {
    if (typeof Notification === "undefined")
      throw new Error("This browser does not support notifications.");
    return Notification.requestPermission();
  },
  async send(title, body) {
    if (typeof Notification !== "undefined") new Notification(title, { body });
  },
};
export const notificationPermission = () => (adapter ?? browser).permission();
export async function enableNotifications() {
  const current = await notificationPermission();
  const permission =
    current === "granted" ? current : await (adapter ?? browser).request();
  if (permission !== "granted")
    throw new Error(
      "Notifications are blocked. Allow Base in your system or browser notification settings, then try again.",
    );
  await (adapter ?? browser).send(
    "Base",
    "Notifications are ready. We'll let you know when your focus session is complete.",
  );
  return permission;
}
export async function notifyFocusComplete() {
  if ((await notificationPermission()) === "granted")
    await (adapter ?? browser).send("Base", "Your focus session is complete.");
}
