// A password that never leaked is not automatically strong, but one that has
// leaked is a standing risk whatever its shape (US-28, standards/07 security).
//
// Named after the need, not the technology. The infra adapter asks the Pwned
// Passwords range API with k-anonymity; the fake is a set. Hashing the
// candidate is an adapter detail and does not belong in this interface.
export interface CompromisedPasswordRegistry {
    isCompromised(candidate: string): Promise<boolean>;
}
