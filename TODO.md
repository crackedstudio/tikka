# Task TODO: Settings refactor (client)

## Steps
- [ ] Explore and document current Settings/notification service behavior
- [ ] Refactor `client/src/pages/Settings.tsx` into sectionized components under `client/src/components/settings/`
- [ ] Add typed hooks for settings/notifications mutations + loading/error states
- [ ] Wire notification event preference “Save” to a real API endpoint (or add the missing endpoint)
- [ ] Add confirmation UI for destructive account actions if present
- [ ] Add unit tests: section rendering + failed preference saves
- [ ] Run `cd client && npm run lint && npm run test && npm run build`

