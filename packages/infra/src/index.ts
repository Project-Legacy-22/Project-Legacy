export { createSupabaseItemStore } from './supabase-item-repository.js';
export type { SupabaseSettings } from './supabase-item-repository.js';
export { createSupabaseAttentionReader } from './supabase-attention-reader.js';
export { createSupabaseIdentityProvider } from './supabase-identity-provider.js';
export type { SupabaseAuthSettings } from './supabase-identity-provider.js';
export { createSupabasePersonalDataStore } from './supabase-personal-data-store.js';

export { createHibpPasswordRegistry } from './hibp-password-registry.js';
export type { HibpSettings } from './hibp-password-registry.js';
export type { ItemStore } from './item-store.js';
export { createSupabaseProjectRepository } from './supabase-project-repository.js';
export { createSupabaseMembershipRepository } from './supabase-membership-repository.js';
export { createSupabaseInvitationRepository } from './supabase-invitation-repository.js';
export { createLogger } from './logger.js';

// La chaine evenementielle de US-10 : le relais vide l outbox vers le broker,
// le worker consomme et produit la notification.
export { createSupabaseOutboxStore } from './outbox-store.js';
export type { OutboxStore } from './outbox-store.js';
export { createRedisEventBus, EVENT_QUEUE } from './redis-event-bus.js';
export type { EventBus, RedisSettings } from './redis-event-bus.js';
export { createSupabaseNotificationStore } from './notification-store.js';
export type { NotificationStore } from './notification-store.js';
export { relayOnce } from './outbox-relay.js';
export type { RelayDependencies } from './outbox-relay.js';
export { consume } from './event-consumer.js';
export { deliverPending } from './delivery-pass.js';
export type { DeliveryPassDependencies, DeliveryPassResult } from './delivery-pass.js';
export type { ConsumeDependencies, ConsumeOutcome } from './event-consumer.js';
export { createPrometheusMetrics } from './prometheus-metrics.js';
export type { MetricsOptions } from './prometheus-metrics.js';

// Les valeurs lues a l instant de la mesure, seule forme correcte sur une
// cible sans processus persistant.
export { createBuildStateReading } from './build-state-reading.js';
export type { BuildIdentity } from './build-state-reading.js';
export { createBusStateReadings } from './bus-state-readings.js';
export { createSupabaseStateReadings } from './supabase-state-readings.js';
