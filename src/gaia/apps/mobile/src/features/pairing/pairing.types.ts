export interface PairingOffer { v: 1; name: string; pc_id: string; origins: string[]; pin: string; invite: string; exp: number }
export type PairingErrorCode =
    | 'invalid_code'      // not a GAIA pairing code / link, or v != 1
    | 'expired'           // exp in the past (checked on the phone before any request)
    | 'refused'           // 403 from /api/devices/pair: same message for every cause
    | 'rate_limited'      // 429
    | 'pin_mismatch'      // TLS pin didn't match: hard failure, never "trust anyway"
    | 'unreachable'       // no origin answered (not on the same home network, PC off, pairing off)
    | 'not_home_network'; // 403 from the listener for a non-private peer
export class PairingError extends Error { constructor(public code: PairingErrorCode, message?: string) { super(message ?? code) } }
export type PairedStatus = 'pending' | 'allowed' | 'revoked';
export interface PairedPc { pcId: string; name: string; origin: string; deviceId: string; status: PairedStatus; pairedAt: string }
export interface PairingApi {
    parseOffer(text: string): PairingOffer;            // QR text or a pasted code/link; throws PairingError('invalid_code' | 'expired')
    redeem(offer: PairingOffer, deviceName: string): Promise<PairedPc>; // status 'pending'
    status(pcId: string): Promise<PairedStatus>;       // polls the listener: 403 device_pending → pending, 200 → allowed, 401 → revoked
    forget(pcId: string): Promise<void>;               // DELETE /api/devices/me, then drops the token and pin
    list(): Promise<PairedPc[]>;
    current(): PairedPc | null;
}
