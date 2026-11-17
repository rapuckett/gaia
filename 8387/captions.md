# PR #8387 phone screenshots

The phone app's web build, shot at 390 x 844 pt in dark mode in headless Chromium. Chats, schedules and the permission prompt come from this branch's real Agent UI backend, with a scripted model and a throwaway GAIA home.

1. `1-pairing-en.png`: After the user pastes a pairing code, the phone shows which PC it will pair with and that PC's home-network address before it sends anything. The code is a made-up invitation for "Office PC", and the web build pairs through the app's built-in fake pairing service.
2. `2-chats-en.png`: The chat list in the side drawer, with the scheduled tasks and goals links. The five chats were created on the backend, and their replies come from the scripted model.
3. `3-schedules-en.png`: Scheduled tasks from the PC, read-only on the phone, each showing its schedule, run count and next run. The three schedules were created on the backend for the shot.
4. `4-your-pcs-en.png`: Your PCs, after pairing with two PCs, with the one in use marked. Both PCs are made-up invitations paired through the web build's fake pairing service, adjusted for this shot to clear a finished invitation the way the real phone service does.
5. `5-permission-en.png`: A permission prompt in a chat. GAIA asks before it writes a file outside the chat's folders, and shows the path and the content first. The scripted model asked for this write, and it was never approved.
6. `6-schedules-ar.png`: The scheduled tasks screen in Arabic, laid out right to left, with each label's English term in brackets, or on its own line when it is long. The same backend data as shot 3.
