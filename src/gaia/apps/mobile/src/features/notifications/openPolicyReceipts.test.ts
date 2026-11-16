import { openPolicyReceipts } from './openPolicyReceipts';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

describe('openPolicyReceipts', () => {
    it('opens the policy alerts with the receipt as a route param', () => {
        const push = jest.fn();
        openPolicyReceipts('rcpt-4f2a', { push });
        expect(push).toHaveBeenCalledWith({ pathname: '/notifications', params: { receipt: 'rcpt-4f2a' } });
    });
});
