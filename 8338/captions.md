# PR #8338, Settings > Phones and tablets (desktop, dark, 1280x800)

Real backend from the PR branch with a throwaway GAIA home. The app shell's setup and model-status answers are stubbed so the first-run wizard doesn't cover Settings.

- 2-after-on-en.png / 2-after-on-ar.png: device_pairing on, pairing open: listener toggle, pairing QR and "Copy pairing link". Simulated device routes; the QR encodes a throwaway invitation for a documentation address.
- 3-after-waiting-en.png / 3-after-waiting-ar.png: a phone waiting for approval, with Allow and Deny. Simulated pending phone.
- 4-after-paired-en.png / 4-after-paired-ar.png: a paired phone listed with Remove. Simulated paired phone.
- 1-before-off-en.png: device_pairing off (the default): the settings list has no Phones and tablets entry. Real backend answering 403. The same in Arabic, so one shot.
