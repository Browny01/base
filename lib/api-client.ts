type Transport = (input: string, init?: RequestInit) => Promise<Response>;
let transport: Transport | null = null;
export function installApiTransport(next: Transport) {
  transport = next;
}
/** Web uses same-origin cookies; desktop injects a scoped native transport. */
export function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  return transport ? transport(input, init) : fetch(input, init);
}

export const hasCustomApiTransport = () => transport !== null;
