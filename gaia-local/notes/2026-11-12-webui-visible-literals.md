# Visible English that bypasses the i18n catalogs (2026-11-12)

The Agent UI at `e71ed4e03` (the main checkout) shows **457 English strings in 67 files** that skip `en.ts` and `ar.ts`, so the Arabic UI shows them in English and the phone app can't reuse them (Rich's reuse rule). Another 28 are names, units or URLs, which belong in constants rather than the catalogs. Files are ranked by when the phone app needs them: the backlog tier of the matrix rows that cite each file, then how many P1 rows use it.

| Tier | Files | Strings to move |
| --- | --- | --- |
| P1 | 11 | 110 |
| P2 | 2 | 12 |
| P3 | 10 | 74 |
| P4 | 44 | 261 |

## Ranked list

| # | File | Tier | P1 rows | Strings | Names/units | Examples (line: text) |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `components/ChatView.tsx` | P1 | 8 | 20 | 0 | 622: "${RECONNECTING_PREFIX} (attempt ${reconnect} of ${MAX_STREAM_RECONNECT"; 1157: "${RECONNECTING_PREFIX} (attempt ${attempt} of ${MAX_STREAM_RECONNECTS}"; 1651: "Chat title" |
| 2 | `components/Sidebar.tsx` | P1 | 8 | 8 | 1 | 364: "Could not search inside chats: ${err instanceof Error ? err.message : "; 410: "Could not mark the chat read: ${err instanceof Error ? err.message : e"; 133: "${ordinal(queuePlace)} in line" |
| 3 | `components/MessageBubble.tsx` | P1 | 8 | 6 | 0 | 830: "This answer was kept from Retry with… (${message.stats.model})"; 891: "code"; 972: "Open in file explorer: ${path}" |
| 4 | `components/NewChat.tsx` | P1 | 5 | 1 | 0 | 244: "The first message was not sent." |
| 5 | `App.tsx` | P1 | 4 | 11 | 0 | 106: "Loading"; 333: "HTTP ${outcome.httpStatus}: ${outcome.message}"; 537: "New chat" |
| 6 | `components/ConnectionBanner.tsx` | P1 | 3 | 30 | 1 | 187: "Download of"; 187: "failed."; 194: "Downloading" |
| 7 | `components/QueuedMessages.tsx` | P1 | 2 | 12 | 0 | 39: "Messages waiting to send"; 60: "Send again: ${item.text}"; 62: "Send again" |
| 8 | `components/AgentActivity.tsx` | P1 | 2 | 3 | 0 | 957: "unknown"; 1083: "BLOCK"; 1088: "unknown tool" |
| 9 | `components/PermissionModeChip.tsx` | P1 | 1 | 1 | 0 | 74: "${prev ?? ''} Couldn't re-read the saved mode: ${requestErrorText(e)}" |
| 10 | `utils/streamSteps.ts` | P1 | 0 | 12 | 0 | 40: "Thinking"; 45: "Commentary"; 52: "Using tool" |
| 11 | `utils/toolEvents.ts` | P1 | 0 | 6 | 0 | 34: "Trust this folder's instructions and skills?"; 34: "Allow ${toolLabel}?"; 38: "GAIA would put this folder's CLAUDE.md, AGENTS.md and skills in the mo" |
| 12 | `utils/chatAlerts.ts` | P2 | 0 | 7 | 0 | 58: "GAIA hit a problem"; 59: "GAIA stopped"; 60: "A chat stopped running" |
| 13 | `stores/scheduleStore.ts` | P2 | 0 | 5 | 0 | 38: "Scheduled task "${s.name}" failed"; 140: "Failed to load schedules"; 164: "Failed to update schedule" |
| 14 | `components/email/EmailPreScanCard.tsx` | P3 | 0 | 29 | 0 | 201: "Urgent"; 210: "Needs a response"; 219: "Suggested archives" |
| 15 | `components/render/calculator/calculatorDoc.ts` | P3 | 0 | 16 | 0 | 77: "Bill"; 78: "Tip"; 79: "People" |
| 16 | `components/ModelChip.tsx` | P3 | 0 | 11 | 1 | 68: "Downloading, ${pct}%"; 335: "${displayModelName(model)} is no longer in the model list, so it wasn'"; 345: "Downloading ${displayModelName(model)} failed: ${progress.message ?? '" |
| 17 | `components/render/UnsupportedCard.tsx` | P3 | 0 | 5 | 0 | 51: "Raw payload"; 54: "Payload too large to display ("; 54: "bytes)" |
| 18 | `components/render/ConfirmationCard.tsx` | P3 | 0 | 4 | 0 | 52: "Confirmation dismissed"; 61: "Approval needed"; 69: "Nothing was executed. Follow the assistant&apos;s guidance below to ap" |
| 19 | `components/RetryWithMenu.tsx` | P3 | 0 | 3 | 1 | 61: "Retry with"; 67: "Loading models…"; 70: "No other model is downloaded on this PC. Add one in Settings → Model." |
| 20 | `components/LongContent.tsx` | P3 | 0 | 3 | 0 | 135: "the first ${n(env.head.length)} and last ${n(env.tail.length)} charact"; 136: "the first ${n(env.head.length)} characters"; 139: "Showing ${shown}${of}${omitted}." |
| 21 | `components/render/CardErrorBoundary.tsx` | P3 | 0 | 1 | 0 | 37: "Card failed to render" |
| 22 | `components/render/calculator/CalculatorCard.tsx` | P3 | 0 | 1 | 0 | 46: "Couldn't copy: ${err instanceof Error ? err.message : String(err)}" |
| 23 | `components/render/guide/GuideCard.tsx` | P3 | 0 | 1 | 0 | 80: "Couldn't ${verb}: ${err instanceof Error ? err.message : String(err)}" |
| 24 | `components/ReadAloudButton.tsx` | P3 | 0 | 0 | 1 | 40: "GB)" |
| 25 | `components/render/ConnectAccountCard.tsx` | P3 | 0 | 0 | 1 | 100: "Microsoft 365" |
| 26 | `components/UnsupportedFeature.tsx` | P4 | 0 | 55 | 0 | 26: "Image"; 28: "This image format cannot be indexed."; 35: "Video" |
| 27 | `components/session-panel/ChangesSection.tsx` | P4 | 0 | 28 | 0 | 258: "Review this chat's changes"; 261: "Changes in this chat ·"; 262: "Close" |
| 28 | `components/MobileAccessModal.tsx` | P4 | 0 | 20 | 0 | 92: "QR code unavailable on this build. Use the link below instead."; 108: "QR code unavailable — the theme did not load. Use the link below inste"; 121: "QR code could not be drawn. Use the link below instead." |
| 29 | `components/TurnChanges.tsx` | P4 | 0 | 17 | 0 | 67: "File changes from this turn"; 71: "Changed"; 75: "Review changes" |
| 30 | `services/api.ts` | P4 | 0 | 13 | 0 | 107: "Access denied."; 112: "The requested item was not found."; 113: "File too large to process." |
| 31 | `components/SetupScreen.tsx` | P4 | 0 | 10 | 4 | 953: "${hardware.ram_gb} GB the OS can use"; 955: "${Math.round(hardware.disk_free_gb)} GB free on disk"; 956: "This PC: ${[hardware.gpu_name, hardware.npu_detected ? 'NPU' : null].f" |
| 32 | `components/FileBrowser.tsx` | P4 | 0 | 10 | 0 | 155: "Unknown error"; 255: "Failed to load directory"; 290: "Search failed" |
| 33 | `components/ChangesReview.tsx` | P4 | 0 | 9 | 0 | 50: "Review changes"; 53: "Changes in this turn"; 54: "Close" |
| 34 | `utils/untrackedWork.ts` | P4 | 0 | 9 | 0 | 17: "Python snippet"; 17: "Python snippets"; 18: "Python script" |
| 35 | `utils/palette.ts` | P4 | 0 | 7 | 0 | 19: "Warm gray"; 20: "Stone and ink"; 21: "Blue marble" |
| 36 | `components/email/EmailConnectCta.tsx` | P4 | 0 | 6 | 3 | 212: "Reopen ${label} sign-in"; 212: "Connect ${label}"; 271: "Connect email account" |
| 37 | `components/render/guide/guideDoc.ts` | P4 | 0 | 6 | 0 | 46: "Start cooking"; 47: "Change the servings, switch units, tap a time to start a timer, or pre"; 51: "Start workout" |
| 38 | `utils/streamErrors.ts` | P4 | 0 | 6 | 0 | 14: "The answer to your last message was lost: its run stopped before it fi"; 43: "If the chat list shows this chat running, reopen it later to see the a"; 45: "GAIA did not respond when this chat reconnected to its running answer." |
| 39 | `components/settings/MessagingSettings.tsx` | P4 | 0 | 5 | 0 | 30: "New Application"; 33: "Reset Token"; 35: "Public Bot" |
| 40 | `stores/modelStore.ts` | P4 | 0 | 4 | 2 | 316: "a cloud provider"; 323: "a cloud provider"; 210: "Couldn't switch to ${displayModelName(model)}: ${err instanceof Error " |
| 41 | `components/DocumentLibrary.tsx` | P4 | 0 | 4 | 0 | 349: "The file type "${ext}" is not supported for indexing."; 398: "Upload failed"; 421: "Folder indexing failed" |
| 42 | `components/PrivateChatButton.tsx` | P4 | 0 | 4 | 0 | 13: "Turn off private chat. This chat isn't saved to memory."; 14: "Turn on private chat. It won't be saved to memory."; 15: "Turn off private chat" |
| 43 | `components/SessionDocsBar.tsx` | P4 | 0 | 4 | 0 | 72: "Manage documents"; 91: "Remove ${d.filename} from this chat"; 100: "more" |
| 44 | `utils/connectorPersonalize.ts` | P4 | 0 | 4 | 0 | 33: "my recent activity in ${displayName}"; 48: "I just connected ${displayName}. Get to know me from ${personalizeSour"; 49: "Read only — do not send, delete, label or change anything." |
| 45 | `components/ConnectorRetryBanner.tsx` | P4 | 0 | 3 | 2 | 126: "connected since this reply — ask again to run it now."; 134: "Ask again"; 140: "Dismiss" |
| 46 | `utils/messageQueue.ts` | P4 | 0 | 3 | 0 | 96: "GAIA could not confirm it read this message."; 143: "GAIA closed while this was being sent, so it may not have gone out."; 144: "Check the chat above before sending it again." |
| 47 | `components/settings/AdvancedSettings.tsx` | P4 | 0 | 2 | 4 | 420: "GAIA v"; 420: "BETA" |
| 48 | `components/setup/DetectedSummary.tsx` | P4 | 0 | 2 | 2 | 111: "GAIA's own"; 122: "GAIA data and logs: ${f.gaiaHome ?? 'unknown'}" |
| 49 | `components/ConnectorsSection.tsx` | P4 | 0 | 2 | 0 | 481: "OAuth"; 481: "MCP" |
| 50 | `components/FolderChip.tsx` | P4 | 0 | 2 | 0 | 93: "GAIA works in ${folder.path}"; 94: "Working folder ${name}, show the chat's folders" |
| 51 | `components/SidebarResizer.tsx` | P4 | 0 | 2 | 0 | 99: "Resize sidebar"; 104: "Drag to resize, double-click to reset" |
| 52 | `components/VersionPicker.tsx` | P4 | 0 | 2 | 0 | 47: "Couldn't reach GitHub to list releases — check your connection; you ca"; 61: "Couldn't reach GitHub to list releases — check your connection; you ca" |
| 53 | `components/settings/ModelServerPanel.tsx` | P4 | 0 | 2 | 0 | 21: "Remote (cloud)"; 43: "${Math.round(ctx / 1024)}K tokens" |
| 54 | `services/queueDispatch.ts` | P4 | 0 | 2 | 0 | 67: "Unknown error"; 137: "GAIA could not say whether it read this message: ${errorText(err)}" |
| 55 | `test/setupApiMocks.ts` | P4 | 0 | 2 | 0 | 35: "This PC’s GPU has its own memory, so there is nothing to split."; 38: "This PC’s GPU has its own memory, so there is nothing to split." |
| 56 | `utils/sessionCleanup.ts` | P4 | 0 | 2 | 0 | 27: "New chat"; 27: "New Task" |
| 57 | `utils/statusEvents.ts` | P4 | 0 | 2 | 0 | 52: "Working"; 57: "Thinking" |
| 58 | `components/CalendarApproval.tsx` | P4 | 0 | 1 | 0 | 145: "This text holds characters that don't show. Those that hide or reorder" |
| 59 | `components/ContextPanel.tsx` | P4 | 0 | 1 | 0 | 35: "${(s * 1000).toFixed(0)} ms" |
| 60 | `components/MemoryDashboard.tsx` | P4 | 0 | 1 | 0 | 1558: "global" |
| 61 | `components/modelMeta.ts` | P4 | 0 | 1 | 0 | 11: "Not downloaded" |
| 62 | `components/settings/ModelSettings.tsx` | P4 | 0 | 1 | 0 | 103: "${r.memory_gb} GB (${r.memory_source})" |
| 63 | `hooks/useAttachments.ts` | P4 | 0 | 1 | 0 | 59: "Upload failed" |
| 64 | `hooks/useChatExport.ts` | P4 | 0 | 1 | 0 | 35: "Couldn't export this chat because GAIA's backend isn't reachable. Try " |
| 65 | `hooks/useFolderPicker.tsx` | P4 | 0 | 1 | 0 | 25: "Couldn't open the folder picker: ${err instanceof Error ? err.message " |
| 66 | `stores/setupDownloadsStore.ts` | P4 | 0 | 1 | 0 | 111: "Lost contact with GAIA: ${errorText(err)}" |
| 67 | `utils/constants.ts` | P4 | 0 | 1 | 0 | 27: "GAIA is starting…" |
| 68 | `utils/newTask.ts` | P4 | 0 | 1 | 0 | 19: "Unknown agent_type '${FLAGSHIP_AGENT_ID}'" |
| 69 | `utils/trayActivity.ts` | P4 | 0 | 1 | 0 | 37: "Untitled chat" |
| 70 | `components/settings/AddCustomModel.tsx` | P4 | 0 | 0 | 2 | 77: "https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF"; 125: "GB" |
| 71 | `components/settings/LemonadeServerSection.tsx` | P4 | 0 | 0 | 1 | 101: "http://localhost:13305" |
| 72 | `components/settings/ModelInUse.tsx` | P4 | 0 | 0 | 1 | 55: "GB" |
| 73 | `components/settings/ModelRow.tsx` | P4 | 0 | 0 | 1 | 51: "GB" |

## How this was found

- `node /Users/rapuckett/Projects/gaia/.local/dev/parity-literal-scan.mjs` (add `--json` for every hit with its line). It parses each `.tsx` and `.ts` under `src/gaia/apps/webui/src` (tests and the catalogs excluded) with TypeScript and collects JSX text, user-facing attributes (`title`, `aria-label`, `placeholder`, `alt`, `label`…), strings passed to message setters and toasts, label-like object properties, and a lower-confidence catch-all for sentence-like strings outside logs, thrown errors, tests, class names and lookups.
- A sample of the catch-all was almost all real copy; expect a few strays. English used only as lookup keys is excluded (`utils/sessionGrouping.ts` and the Sidebar group map translate through the catalog).
- Not covered: strings the backend sends for display (error details, notices), which reach the phone too. The Electron shell's English (`.cjs`) doesn't matter for the phone.
- A sentence split around a value (`Download of` … `failed.` in ConnectionBanner) counts once per fragment but is one message: give it one key with a `{placeholder}`, not one key per fragment.
- When the change lands, re-running the scanner is the check: every remaining hit should be a name, unit or URL that comes from a constant.
