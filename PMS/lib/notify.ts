// Re-export deliverNotification as createNotification for backward compatibility.
// New code should import from '@/lib/deliver' directly.
export { deliverNotification as createNotification } from './deliver'
