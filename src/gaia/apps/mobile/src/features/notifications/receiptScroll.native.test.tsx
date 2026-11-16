import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Dimensions, Platform, ScrollView } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { GaiaClientProvider } from '@/data';
import { createFakeClient } from '@/api/fake';
import { translator } from '@/i18n/useT';
import { useNotificationStore } from '@/state/notifications';
import { ThemeProvider } from '@/ui';

import { NOTIFICATION_SCENES } from './devScenes';
import { NotificationCenterScreen } from './NotificationCenterScreen';

jest.mock('expo-font', () => ({ useFonts: () => [true, null] }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: 'test' } } }));

const describeNative = Platform.OS === 'web' ? describe.skip : describe;
const t = translator('en');
let scrollTo: jest.Mock;

const mount = async (receiptId?: string) => {
    const items = NOTIFICATION_SCENES['policy-alert'].items ?? [];
    useNotificationStore.setState({ items, filter: 'policy_alert' });
    await render(
        <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
            <QueryClientProvider client={new QueryClient()}>
                <GaiaClientProvider client={createFakeClient({})}>
                    <ThemeProvider>
                        <NotificationCenterScreen onBack={() => undefined} onOpenChat={() => undefined} receiptId={receiptId} />
                    </ThemeProvider>
                </GaiaClientProvider>
            </QueryClientProvider>
        </SafeAreaProvider>,
    );
    return { items };
};

describeNative('notification center receipt scroll', () => {
    beforeEach(() => {
        scrollTo = jest.spyOn(ScrollView.prototype as never, 'scrollTo' as never) as unknown as jest.Mock;
        scrollTo.mockReset();
    });

    it('scrolls to the notification that holds the receipt', async () => {
        const { items } = await mount(items0());
        const target = items.find((n) => n.receiptId)!;
        await act(async () => {
            fireEvent(screen.getByTestId(`ntf-${target.id}`), 'layout', { nativeEvent: { layout: { x: 0, y: 1500, width: 390, height: 200 } } });
        });
        expect(scrollTo).toHaveBeenCalledWith({ y: 1500 - (Dimensions.get('window').height - 200) / 2, animated: true });
        expect(screen.queryByTestId('ntf-receipt-missing')).toBeNull();
    });

    it('says the receipt is unavailable for an id that is not in the list', async () => {
        await mount('rcpt-gone');
        expect(screen.getByText(t('activity.policy.receiptUnavailable'))).toBeTruthy();
        expect(scrollTo).not.toHaveBeenCalled();
    });
});

function items0(): string {
    return NOTIFICATION_SCENES['policy-alert'].items!.find((n) => n.receiptId)!.receiptId!;
}
