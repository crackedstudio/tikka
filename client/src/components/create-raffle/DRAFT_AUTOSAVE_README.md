# Draft Autosave Feature - Create Raffle Flow

## Overview

The create-raffle flow now includes automatic draft saving to prevent data loss from accidental page refreshes, browser crashes, or navigation away from the form. This feature enhances user experience by preserving form progress in localStorage.

## Features

### 1. **Automatic Draft Saving**
- Form data is automatically saved to localStorage with a **500ms debounce**
- Only meaningful drafts are saved (at least one field must have content or step > 0)
- Uploaded files (images) are **excluded** from the draft to avoid storage limitations
- Draft includes: title, description, pricePerTicket, totalTickets, duration, and currentStep

### 2. **Draft Restoration**
- On mount, the component checks for saved drafts
- If a draft exists, a modal prompts the user to either:
  - **Restore draft**: Populate form with saved data and resume from saved step
  - **Start fresh**: Clear the draft and start with an empty form
- Modal displays the draft title and save timestamp for user context

### 3. **Draft Cleanup**
- Draft is automatically cleared upon successful raffle creation
- Users can manually discard drafts via the restore modal
- Drafts persist across sessions until explicitly cleared or replaced

## Architecture

### Core Files

#### `raffleDraftStorage.ts`
Core storage utilities for draft persistence.

**Key Functions:**
- `loadRaffleDraft()`: Load draft from localStorage with validation
- `saveRaffleDraft(draft)`: Save meaningful drafts to localStorage
- `clearRaffleDraft()`: Remove draft from localStorage
- `formDataToDraft(formData, currentStep)`: Convert form data to serializable draft
- `draftToFormData(draft)`: Restore form data from draft (excludes files)
- `isDraftMeaningful(draft)`: Check if draft has substantial content

**Constants:**
- `RAFFLE_DRAFT_STORAGE_KEY`: "tikka-create-raffle-draft"
- `RAFFLE_DRAFT_DEBOUNCE_MS`: 500ms

#### `useRaffleDraft.ts`
React hook that orchestrates draft autosave behavior.

**Features:**
- Checks for saved draft on mount
- Manages restore modal state
- Debounced autosave with 500ms delay
- Disables autosave until user makes restore/discard decision
- Provides callbacks: `restoreDraft()`, `discardDraft()`, `clearDraft()`

**Usage:**
```tsx
const {
  pendingDraft,
  showRestoreModal,
  restoreDraft,
  discardDraft,
  clearDraft,
} = useRaffleDraft({
  formData,
  currentStep,
  setFormData,
  setCurrentStep,
});
```

#### `RestoreDraftModal.tsx`
UI component for draft restoration prompt.

**Props:**
- `open`: Boolean to control modal visibility
- `draft`: The draft data to potentially restore
- `onRestore`: Callback when user clicks "Restore draft"
- `onDiscard`: Callback when user clicks "Start fresh"

**Features:**
- Displays human-readable save timestamp
- Shows draft title for context
- Informs user that images need re-upload
- Styled with project's dark/light theme support

### Integration Points

#### `CreateRaffle.tsx`
Main page component integrating the draft system.

**Integration:**
1. Initializes `useRaffleDraft` hook with form state
2. Passes `clearDraft` to `ReviewStep` as `onSubmitSuccess` callback
3. Conditionally renders `RestoreDraftModal` when draft exists
4. Autosave triggers on any `formData` or `currentStep` change

#### `ReviewStep.tsx`
Final step that handles raffle submission.

**Integration:**
- Accepts `onSubmitSuccess?: () => void` prop
- Calls `onSubmitSuccess()` in the `CreateRaffleButton` success callback
- Ensures draft is cleared before navigation to raffle details page

## Data Flow

```
User Types → formData State Updates → Debounce (500ms) → saveRaffleDraft()
                                                              ↓
                                                        localStorage

Page Load → loadRaffleDraft() → Draft Found? → Show Modal → User Choice
                                     ↓ No                       ↓
                                Start Fresh              Restore | Discard
                                                              ↓         ↓
                                                    setFormData()  clearDraft()

Submit Success → onSubmitSuccess() → clearDraft() → localStorage cleared
```

## Testing

### Unit Tests

#### `raffleDraftStorage.spec.ts`
Tests core storage functions:
- ✅ Draft meaningfulness detection
- ✅ Form-to-draft serialization (excluding files)
- ✅ Draft-to-form deserialization
- ✅ LocalStorage persistence and loading
- ✅ Draft clearing
- ✅ Corrupted data handling
- ✅ Empty draft rejection

#### `useRaffleDraft.spec.ts`
Tests hook behavior:
- ✅ Draft restoration on mount
- ✅ Autosave disabled until restore decision
- ✅ Restore functionality
- ✅ Discard functionality
- ✅ Debounced autosave
- ✅ Clear draft functionality

#### `CreateRaffle.spec.tsx`
Integration tests covering:
- ✅ End-to-end autosave flow
- ✅ Draft restoration workflow
- ✅ Draft discard workflow
- ✅ Multi-step navigation with autosave
- ✅ File exclusion from drafts
- ✅ Empty draft handling

### Manual Testing Checklist

1. **Autosave Test**
   - [ ] Open create raffle page
   - [ ] Fill in title and description
   - [ ] Wait 500ms
   - [ ] Open browser DevTools → Application → Local Storage
   - [ ] Verify `tikka-create-raffle-draft` key exists with correct data

2. **Refresh Test**
   - [ ] Fill form partially
   - [ ] Refresh page (F5 or Cmd+R)
   - [ ] Verify restore modal appears
   - [ ] Click "Restore draft"
   - [ ] Verify all fields are populated
   - [ ] Verify correct step is active

3. **Discard Test**
   - [ ] Have a saved draft
   - [ ] Refresh page
   - [ ] Click "Start fresh"
   - [ ] Verify form is empty
   - [ ] Verify localStorage is cleared

4. **Submit & Clear Test**
   - [ ] Complete entire form
   - [ ] Submit raffle successfully
   - [ ] Check localStorage - draft should be cleared
   - [ ] Navigate back to create raffle
   - [ ] Verify no restore modal appears

5. **Multi-Step Test**
   - [ ] Fill details on step 1
   - [ ] Navigate to step 2
   - [ ] Refresh page
   - [ ] Restore draft
   - [ ] Verify you're on step 2 with data intact

6. **Empty Draft Test**
   - [ ] Open create raffle page
   - [ ] Don't enter any data
   - [ ] Refresh page
   - [ ] Verify no restore modal appears

## Acceptance Criteria

✅ **Criterion 1: Refresh Recovery**
- Refresh mid-form → reopen → restore draft → submit successfully
- **Status**: IMPLEMENTED & TESTED

✅ **Criterion 2: Draft Clearing**
- Draft is cleared after successful creation
- **Status**: IMPLEMENTED & TESTED via `onSubmitSuccess` callback

✅ **Criterion 3: No Binary Persistence**
- Uploaded images are excluded from localStorage
- **Status**: IMPLEMENTED via `formDataToDraft()` which only extracts serializable fields

## Browser Compatibility

- ✅ Chrome/Edge (Chromium)
- ✅ Firefox
- ✅ Safari
- ✅ Requires localStorage support (available in all modern browsers)

## Storage Considerations

- **Storage Key**: `tikka-create-raffle-draft`
- **Estimated Size**: < 1KB per draft (text-only fields)
- **Persistence**: Until explicitly cleared or replaced
- **Quota**: LocalStorage limit is typically 5-10MB (drafts use negligible space)

## Future Enhancements

Potential improvements for future iterations:

1. **Multiple Drafts**: Save multiple drafts with unique keys
2. **Draft Expiry**: Auto-delete drafts older than X days
3. **Cloud Sync**: Sync drafts across devices for logged-in users
4. **Draft Diff**: Show changes between draft and current state
5. **Image Metadata**: Save image names/sizes (not binaries) for context
6. **Draft List**: UI to manage multiple saved drafts

## Troubleshooting

### Draft Not Saving
- Check browser's localStorage is enabled
- Verify console for errors
- Ensure at least one field has content

### Draft Not Restoring
- Check localStorage in DevTools
- Verify draft structure matches `RaffleDraftData` interface
- Clear corrupted drafts manually if needed

### Modal Not Appearing
- Verify draft is "meaningful" (not all empty)
- Check `isDraftMeaningful()` logic
- Ensure localStorage key is correct

## Summary

This implementation provides a robust, user-friendly draft autosave system that:
- ✅ Prevents data loss from unexpected events
- ✅ Saves only meaningful content with debouncing
- ✅ Gives users control over restoration
- ✅ Cleans up after successful submission
- ✅ Excludes files to avoid storage issues
- ✅ Is fully tested with unit and integration tests

The feature is production-ready and meets all acceptance criteria specified in the original issue.
