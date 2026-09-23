import type { DomainEvent } from '../domain/event.js';
import type { Membership } from '../domain/membership.js';

// Reading a project's members needs the service role: the only policy on
// project_memberships is project_memberships_select_self, so a session sees
// its own membership and never anyone else's. Authorization therefore lives in
// the use case, as it does for every outbound adapter of this application.
export interface MembershipRepository {
    // Everyone in the project, the caller included. Empty when the project
    // does not exist, which the use case cannot tell from « the caller is not
    // in it » -- and must not, since both answer the same way.
    membersOf(projectId: string): Promise<Membership[]>;
    // L appartenance et l evenement qui l annonce sont ecrits ensemble ou pas
    // du tout. Deux requetes seraient deux transactions, et un echec entre les
    // deux laisserait soit un membre que personne n a annonce, soit une annonce
    // sans appartenance -- exactement ce que l outbox existe pour eviter
    // (ADR-0007).
    //
    // Rend false quand la personne etait deja membre : aucune appartenance
    // creee, donc aucun evenement emis. Ajouter deux fois ne notifie pas deux
    // fois.
    addWithEvent(
        addition: { projectId: string; memberId: string },
        event: DomainEvent,
    ): Promise<boolean>;
}
