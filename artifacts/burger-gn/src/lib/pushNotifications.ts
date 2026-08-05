/**
 * Future Web Push / FCM integration surface.
 * Do not wire real push providers here yet.
 */
import { queuePushNotification, isPushIntegrated } from './myOrder';

export { isPushIntegrated };

export function notifyOrderStatusChange(input: {
  trackingId: string;
  workflow: string;
  title: string;
  body: string;
}) {
  queuePushNotification({
    type: 'order_status',
    trackingId: input.trackingId,
    workflow: input.workflow,
    title: input.title,
    body: input.body,
  });

  // Future:
  // if (Notification.permission === 'granted') new Notification(input.title, { body: input.body });
  // if (isPushIntegrated()) await sendViaFcm(input);
}
