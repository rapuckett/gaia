// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import SettingsGalleryRoute from '@/app/dev/settings';

import { SETTINGS_SCENES } from './devScenes';

jest.mock('expo-font', () => ({ useFonts: () => [true, null] }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: 'test' } } }));
let mockState: string | undefined;
jest.mock('expo-router', () => ({
    Redirect: () => null,
    useLocalSearchParams: () => ({ state: mockState }),
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => false }),
    usePathname: () => '/dev/settings',
}));

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const mount = () =>
    render(
        <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
            <SettingsGalleryRoute />
        </SafeAreaProvider>,
    );

describeNative('/dev/settings', () => {
    it.each(Object.keys(SETTINGS_SCENES))('renders the %s scene', async (name) => {
        mockState = name;
        await mount();
        expect(screen.queryByText(/^No settings scene/)).toBeNull();
    });

    it.each([
        ['gpu-adjustable', 'gpu-memory'],
        ['gpu-adjustable-setup', 'setup-gpu'],
        ['gpu-read-error', 'gpu-memory'],
        ['gpu-read-error-setup', 'setup-gpu'],
    ])('shows the GPU row in %s', async (name, testID) => {
        mockState = name;
        await mount();
        expect(await screen.findByTestId(testID)).toBeTruthy();
    });

    it.each([
        ['model-key-disconnected', 'Reconnect'],
        ['model-search-empty', 'No models match.'],
        ['model-hf-checking', /Needs 64 GB/],
        ['model-hf-warnings', /Not tested on the NPU/],
        ['model-details-npu', /Measured:.*17\/20 tasks/],
        ['model-details-npu', /\(expected\)/],
        ['model-details-unfit', /Can.t run here: needs 320 GB of memory/],
        ['model-hf-ready', /Add .*Demo Chat/],
        ['model-search-miss', 'No models match.'],
        ['model-details', /huggingface\.co\/me\/my-tuned-GGUF/],
        ['model-local-empty', /No models yet\./],
        ['model-available', 'Available to download'],
        ['model-fireworks', /Show all models/],
        ['model-unavailable', 'Not available on your PC'],
        ['model-downloading', /Downloading Qwen3\.6 35B A3B|42%/],
        ['model-switching', /My tuned model/],
        ['model-custom', 'Remove'],
        ['model-npu-not-ready', /NPU/],
        ['spend-total', 'Cloud spending this month'],
        ['spend-near-limit', /Close to your limit/],
        ['spend-over-limit', /You.ve reached your limit/],
    ])('%s shows its key text', async (name, text) => {
        mockState = name;
        await mount();
        expect((await screen.findAllByText(text, { includeHiddenElements: true })).length).toBeGreaterThan(0);
    });

    it.each([
        ['msg-loading', 'Loading…'],
        ['msg-pc-refused', 'Change this on the PC running GAIA.'],
        ['msg-needs-token', 'Create a bot'],
        ['msg-token-invalid', /Discord no longer accepts this token/],
        ['msg-conflict', /already uses this bot/],
        ['msg-credentials', /couldn.t read the saved bot token/],
        ['msg-stopped', /isn.t answering on Discord right now/],
        ['msg-crashed', /stopped answering on Discord unexpectedly/],
        ['msg-error', 'The Discord bot stopped with an error.'],
        ['msg-taken-over', /Another PC is answering this bot/],
        ['msg-starting', /Connecting to Discord/],
        ['msg-pairing', 'DM the bot this code'],
        ['msg-pairing-waiting', 'Waiting for a code…'],
        ['msg-paired', /Answering .*Alex.* as .*GAIA Helper/],
        ['msg-paired-now', 'Paired. GAIA answers you on Discord now.'],
        ['adv-server-loaded', 'Speech recognition model'],
        ['adv-server-checking', 'Checking the model server…'],
        ['adv-server-error', /The model server isn.t answering/],
        ['adv-server-pc-only', 'Change this on the PC running GAIA.'],
        ['adv-server-unreachable', /The model server isn.t answering/],
        ['adv-server-none-loaded', 'None loaded'],
        ['adv-server-backend-installable', /Vulkan downloads on first use/],
        ['adv-server-no-backends', /so there is nothing to choose/],
        ['adv-server-backend-switch', 'Reload chat model now'],
        ['adv-target-own', 'GAIA uses its own Lemonade Server.'],
        ['adv-target-yours', /GAIA uses your Lemonade Server at/],
        ['adv-target-env', /set by LEMONADE_BASE_URL/],
        ['adv-target-env-ignored', /GAIA ignores the address set outside the app/],
        ['adv-target-error', 'Could not read which model server GAIA uses'],
        ['adv-not-downloaded', 'Model not downloaded.'],
        ['adv-wrong-model', 'Wrong model loaded.'],
        ['adv-small-context', 'Context window too small.'],
        ['adv-unreachable', /Could not reach GAIA.s assistant/],
        ['skills-skipped', /bare couldn.t be loaded: it has no description/],
        ['privacy-delete-none', 'No chats to delete yet.'],
        ['perm-default', 'Start new chats in full access'],
        ['perm-full-confirm', 'Turn on full access for new chats'],
        ['perm-chats', 'Chat b'],
        ['voice-preview', 'Preview'],
        ['model-local-only-blocked', /Blocked by Local only/],
        ['model-providers-offline', 'Check again'],
        ['nav-back-link', 'Back to Privacy'],
        ['nav-crash', 'Try again'],
    ])('%s shows its key text', async (name, text) => {
        mockState = name;
        await mount();
        expect((await screen.findAllByText(text, { includeHiddenElements: true })).length).toBeGreaterThan(0);
    });

    it.each([
        ['adv-custom-empty', 'advanced-custom-toggle', 'Leave empty to use the model chosen under Model.'],
        ['adv-custom-saved', 'advanced-custom-toggle', /Qwen3-4B-Instruct-2507-GGUF/],
        ['adv-custom-unlisted', 'advanced-custom-toggle', /the model server doesn.t list/],
        ['adv-custom-unchecked', 'advanced-custom-toggle', /couldn.t check this ID/],
        ['adv-custom-pc-only', 'advanced-custom-toggle', 'Change this on the PC running GAIA.'],
        ['adv-dynamic-on', 'advanced-dynamic-toggle', /Start each chat with GAIA.s most-used tools/],
        ['adv-dynamic-locked', 'advanced-dynamic-toggle', /Controlled by GAIA_DYNAMIC_TOOLS/],
        ['adv-mcp-failed', null, 'Failed'],
        ['adv-mcp-ok', 'advanced-mcp-toggle', /12.* tools/],
    ])('%s shows its key text once opened', async (name, toggle, text) => {
        mockState = name;
        await mount();
        if (toggle) await fireEvent.press(await screen.findByTestId(toggle, { includeHiddenElements: true }));
        expect((await screen.findAllByText(text, { includeHiddenElements: true })).length).toBeGreaterThan(0);
    });

    it.each([
        ['adv-details', 'Capabilities', /chat, vision, tool calling/],
        ['adv-details-warn', 'Device', /CPU/],
    ])('%s lists the detail rows once More details is opened', async (name, label, value) => {
        mockState = name;
        await mount();
        await fireEvent.press(await screen.findByLabelText('More details', { includeHiddenElements: true }));
        expect((await screen.findAllByText(label, { includeHiddenElements: true })).length).toBeGreaterThan(0);
        expect((await screen.findAllByText(value, { includeHiddenElements: true })).length).toBeGreaterThan(0);
    });

    it.each([
        ['automations-list', /Inbox digest/],
        ['automations-list', 'Paused'],
        ['automations-remove', /Remove .*Inbox digest.*\?/],
        ['automations-no-delivery', 'Open Messaging'],
        ['automations-delivery-unknown', /couldn.t check whether Discord is connected/],
        ['automations-empty', /No automations yet/],
        ['automations-load-failed', 'Could not load your automations.'],
        ['automations-pc-refused', 'Change this on the PC running GAIA.'],
    ])('%s shows %s', async (name, text) => {
        mockState = name;
        await mount();
        expect((await screen.findAllByText(text, { includeHiddenElements: true })).length).toBeGreaterThan(0);
    });

    it('automations-loading shows the loading line and no cards', async () => {
        mockState = 'automations-loading';
        await mount();
        expect((await screen.findAllByText('Loading…', { includeHiddenElements: true })).length).toBeGreaterThan(0);
        expect(screen.queryByTestId('automation-a1b2c3d4', { includeHiddenElements: true })).toBeNull();
    });

    it('automations-busy disables Remove while Pause is in flight', async () => {
        mockState = 'automations-busy';
        await mount();
        await fireEvent.press(await screen.findByTestId('automation-toggle-a1b2c3d4', { includeHiddenElements: true }));
        await waitFor(() => expect(screen.getByTestId('automation-remove-a1b2c3d4', { includeHiddenElements: true })).toBeDisabled());
    });

    it('automations-action-error shows the failure sentence and the PC text', async () => {
        mockState = 'automations-action-error';
        await mount();
        await fireEvent.press(await screen.findByTestId('automation-toggle-a1b2c3d4', { includeHiddenElements: true }));
        expect(await screen.findByTestId('automations-action-failed', { includeHiddenElements: true })).toBeTruthy();
        expect((await screen.findAllByText(/scheduler.json is locked/, { includeHiddenElements: true })).length).toBeGreaterThan(0);
    });

    it('general-custom-colors opens Colors with the custom accent, tint and Reset', async () => {
        mockState = 'general-custom-colors';
        await mount();
        for (const label of ['Accent', 'Background tint', 'Reset']) expect((await screen.findAllByText(label, { includeHiddenElements: true })).length).toBeGreaterThan(0);
    });

    it('privacy-delete asks with the chat count before deleting', async () => {
        mockState = 'privacy-delete';
        await mount();
        await screen.findByText(/^Deletes every chat/, undefined, { timeout: 5000 });
        await fireEvent.press(await screen.findByTestId('privacy-delete-all'));
        expect(await screen.findByText('Delete all 3 chats?')).toBeTruthy();
    });

    it('voice-preview reads Stop while the preview is in flight', async () => {
        mockState = 'voice-preview';
        await mount();
        await fireEvent.press(await screen.findByTestId('read-aloud-preview', { includeHiddenElements: true }));
        expect((await screen.findAllByText('Stop reading', { includeHiddenElements: true })).length).toBeGreaterThan(0);
    });

    it('perm-chats offers Revoke all on a chat holding two grants', async () => {
        mockState = 'perm-chats';
        await mount();
        expect((await screen.findAllByText('npm test', { includeHiddenElements: true })).length).toBeGreaterThan(0);
        expect((await screen.findAllByLabelText(/More actions/, { includeHiddenElements: true })).length).toBe(2);
    });

    it('msg-load-failed says the status could not be read once the retries are spent', async () => {
        mockState = 'msg-load-failed';
        await mount();
        expect(await screen.findByText(/Couldn.t read the Discord status/, undefined, { timeout: 15000 })).toBeTruthy();
    }, 20000);

    it('model-many shows the search field, and a model-details scene shows the row id', async () => {
        mockState = 'model-many';
        await mount();
        expect(await screen.findByTestId('model-search', { includeHiddenElements: true })).toBeTruthy();
    });

    it('model-custom hides Remove for the model in use', async () => {
        mockState = 'model-custom';
        await mount();
        expect(await screen.findByTestId('model-remove-user.my-tuned-GGUF', { includeHiddenElements: true })).toBeTruthy();
        expect(screen.queryByTestId('model-remove-user.in-use-GGUF', { includeHiddenElements: true })).toBeNull();
    });

    it('model-hf-check-running holds the Check button busy with the link typed', async () => {
        mockState = 'model-hf-check-running';
        await mount();
        expect(await screen.findByDisplayValue(/Demo-Chat-GGUF/, undefined, { timeout: 3000 })).toBeTruthy();
        expect(screen.getByTestId('custom-model-check', { includeHiddenElements: true })).toBeDisabled();
    });

    it('model-hf-added opens on the success notice with no typing', async () => {
        mockState = 'model-hf-added';
        await mount();
        expect(await screen.findByText(/Added .*Demo Chat.*Choose Download/, undefined, { timeout: 3000 })).toBeTruthy();
    });
});
