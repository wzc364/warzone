# Security Specification: Ironfront Dominion

## 1. Data Invariants
1. A `UserProfile` document at `/users/{userId}` can only be created or modified by the verified owner (`request.auth.uid == userId && request.auth.token.email_verified == true`), never spoofed for another UID.
2. PII (`email`) is strictly isolated inside `/users/{userId}/private/{docId}` and is unreadable by any user other than `userId`.
3. `UserProfile.createdAt` and `UserProfile.uid` are immutable after creation; `createdAt == request.time` on create and `updatedAt == request.time` on every create/update.
4. `CommunityReplay` documents can only be created by a verified signed-in user whose `authorUid == request.auth.uid`, with `likesCount == 0` at creation, bounded `timelineEvents.size() <= 400`, and immutable `authorUid`, `replayId`, and `createdAt`.
5. Upvoting a replay requires creating `/communityReplays/{replayId}/likes/{userId}` where `userId == request.auth.uid` and atomically updating `likesCount` on the parent replay using `getAfter`/`existsAfter` (`likesCount == existing().likesCount + 1`).
6. `MultiplayerRoom` documents transition strictly `waiting -> active -> finished`. Terminal state `finished` locks the room from further edits.

## 2. The "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)
1. **Identity Spoofing on Profile**: Creating `/users/victimUid` while authenticated as `attackerUid`.
2. **Shadow Field Injection on Profile**: Creating `/users/attackerUid` with extra field `isAdmin: true`.
3. **PII Leak Attempt**: Reading `/users/victimUid/private/account` as `attackerUid`.
4. **Unverified Email Write**: Creating `/users/attackerUid` when `request.auth.token.email_verified == false`.
5. **Timestamp Forgery**: Creating `/users/attackerUid` with client-supplied past `createdAt` instead of `request.time`.
6. **Immutable UID Tampering**: Updating `/users/attackerUid` to change `uid` to `otherUid`.
7. **Oversized ID Poisoning**: Creating `/communityReplays/` with a 300-character document ID containing invalid characters.
8. **Fake Likes Inflation on Create**: Creating a `CommunityReplay` with `likesCount: 9999` instead of `0`.
9. **Orphaned Like Without Parent Sync**: Creating `/communityReplays/rep1/likes/attackerUid` without atomically incrementing `likesCount` on `rep1`.
10. **Replay Author Tampering**: Updating another user's `CommunityReplay` title as `attackerUid`.
11. **Terminal Room Reopen**: Updating a `MultiplayerRoom` whose `status` is `'finished'` back to `'waiting'`.
12. **Array Resource Exhaustion**: Writing `unlockedCosmetics` with > 100 items or `timelineEvents` with > 400 events.
