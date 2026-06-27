/**
 * Type definitions for subscription change events from auth-service via RabbitMQ
 */

export interface SubscriptionChangedMessage {
   userId: string;
   subscriptionId: string;
   planId: string;
   action: 'created' | 'updated' | 'deleted';
}

export interface SubscriptionGatingChangedMessage {
   planId: string;
   action: 'created' | 'updated' | 'deleted';
}
